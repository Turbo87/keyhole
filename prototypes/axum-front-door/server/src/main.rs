//! PROTOTYPE: axum in front of SvelteKit. Throwaway spike, not production code.
//!
//! axum serves `/api/*`, proxies everything else to SvelteKit and owns the
//! Node process. `WEB_MODE=prod` (default) runs the `adapter-node` build,
//! `WEB_MODE=dev` runs the Vite dev server.

use std::process::{ExitCode, Stdio};
use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::extract::{Query, Request, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::{TokioExecutor, TokioIo};
use tokio::process::Command;
use tokio::signal::unix::{SignalKind, signal};

#[derive(Clone)]
struct AppState {
    client: Client<HttpConnector, Body>,
    upstream: String,
}

#[tokio::main]
async fn main() -> ExitCode {
    let dev = std::env::var("WEB_MODE").as_deref() == Ok("dev");
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let web_port: u16 = if dev { 5173 } else { 3000 };
    let api_origin = format!("http://127.0.0.1:{port}");

    let mut command = if dev {
        let mut c = Command::new("pnpm");
        c.args(["exec", "vite", "dev", "--host", "127.0.0.1", "--port"])
            .arg(web_port.to_string())
            .arg("--strictPort");
        c
    } else {
        let mut c = Command::new("node");
        // Node derives its origin from `Host` plus this header, defaulting to
        // https. Fly.io's edge sets it, axum fills it in for local http.
        c.arg("build")
            .env("HOST", "127.0.0.1")
            .env("PORT", web_port.to_string())
            .env("PROTOCOL_HEADER", "x-forwarded-proto");
        c
    };
    // Own process group, so a terminal Ctrl-C reaches only axum and axum
    // decides when Node gets the signal.
    let mut web = command
        .current_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../web"))
        .env("API_ORIGIN", &api_origin)
        .process_group(0)
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .expect("failed to start web server");
    let web_pid = web.id().expect("web server has a pid") as i32;
    eprintln!("[axum] started web server (pid {web_pid}, dev={dev})");

    let state = AppState {
        client: Client::builder(TokioExecutor::new()).build_http(),
        upstream: format!("127.0.0.1:{web_port}"),
    };
    let app = Router::new()
        .route("/api/hello", get(hello))
        .route("/api/whoami", get(whoami))
        .route("/api/slow", get(slow))
        .fallback(proxy)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await.unwrap();
    eprintln!("[axum] listening on {api_origin}");

    let (signal_tx, signal_rx) = tokio::sync::oneshot::channel();
    let server = axum::serve(listener, app).with_graceful_shutdown(async move {
        let received = shutdown_signal().await;
        eprintln!("[axum] received signal {received}, draining requests");
        let _ = signal_tx.send(received);
    });

    tokio::select! {
        result = server => {
            result.unwrap();
            let received = signal_rx.await.unwrap();
            eprintln!("[axum] drained, forwarding signal {received} to web server");
            unsafe { libc::kill(-web_pid, received) };
            match tokio::time::timeout(Duration::from_secs(35), web.wait()).await {
                Ok(status) => {
                    eprintln!("[axum] web server exited with {:?}, exiting", status.unwrap());
                    ExitCode::SUCCESS
                }
                Err(_) => {
                    eprintln!("[axum] web server did not exit in time, killing it");
                    unsafe { libc::kill(-web_pid, libc::SIGKILL) };
                    ExitCode::FAILURE
                }
            }
        }
        status = web.wait() => {
            eprintln!("[axum] web server exited unexpectedly with {:?}, exiting", status.unwrap());
            ExitCode::FAILURE
        }
    }
}

async fn shutdown_signal() -> i32 {
    let mut interrupt = signal(SignalKind::interrupt()).unwrap();
    let mut terminate = signal(SignalKind::terminate()).unwrap();
    tokio::select! {
        _ = interrupt.recv() => libc::SIGINT,
        _ = terminate.recv() => libc::SIGTERM,
    }
}

async fn proxy(State(state): State<AppState>, mut req: Request) -> Result<Response, StatusCode> {
    let path = req.uri().path_and_query().map_or("/", |p| p.as_str());
    *req.uri_mut() = format!("http://{}{path}", state.upstream).parse().unwrap();
    req.headers_mut()
        .entry("x-forwarded-proto")
        .or_insert(HeaderValue::from_static("http"));

    let client_upgrade = req
        .headers()
        .contains_key(header::UPGRADE)
        .then(|| hyper::upgrade::on(&mut req));

    let mut response = state.client.request(req).await.map_err(|error| {
        eprintln!("[axum] proxy error: {error}");
        StatusCode::BAD_GATEWAY
    })?;

    if response.status() == StatusCode::SWITCHING_PROTOCOLS
        && let Some(client_upgrade) = client_upgrade
    {
        let upstream_upgrade = hyper::upgrade::on(&mut response);
        tokio::spawn(async move {
            let (Ok(client), Ok(upstream)) = tokio::join!(client_upgrade, upstream_upgrade) else {
                eprintln!("[axum] websocket upgrade failed");
                return;
            };
            let result = tokio::io::copy_bidirectional(
                &mut TokioIo::new(client),
                &mut TokioIo::new(upstream),
            )
            .await;
            eprintln!("[axum] websocket closed: {result:?}");
        });
    }

    Ok(response.map(Body::new))
}

async fn hello() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/json")], r#"{"message":"hello from axum"}"#)
}

async fn whoami(headers: HeaderMap) -> impl IntoResponse {
    let get = |name| headers.get(name).and_then(|v| v.to_str().ok()).unwrap_or("-");
    let body = format!(
        r#"{{"host":"{}","cookie":"{}"}}"#,
        get(header::HOST),
        get(header::COOKIE)
    );
    ([(header::CONTENT_TYPE, "application/json")], body)
}

#[derive(serde::Deserialize)]
struct SlowQuery {
    ms: Option<u64>,
}

async fn slow(Query(query): Query<SlowQuery>) -> impl IntoResponse {
    let ms = query.ms.unwrap_or(1500);
    tokio::time::sleep(Duration::from_millis(ms)).await;
    (
        [(header::CONTENT_TYPE, "application/json")],
        format!(r#"{{"slept_ms":{ms}}}"#),
    )
}
