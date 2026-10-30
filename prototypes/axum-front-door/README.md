# PROTOTYPE: axum in front of SvelteKit

Throwaway spike for the question "Does axum in front of SvelteKit work in production and development?". axum serves `/api/*`, proxies every other request to SvelteKit on localhost and owns the Node process. Nothing here is production code.

```sh
(cd web && pnpm install && pnpm build)
(cd server && cargo build)
server/target/debug/axum-front-door-prototype                # production: node build on :3000
WEB_MODE=dev server/target/debug/axum-front-door-prototype   # development: Vite on :5173
./check.sh      # SSR, /api from load(), streaming, CSRF against :8080
./shutdown.sh   # signal forwarding and shutdown ordering (production build)
node hmr.mjs    # raw websocket through axum to Vite's HMR endpoint
```

The proxy is hand-written on the `hyper-util` legacy client (about 40 lines in `server/src/main.rs`) and keeps the incoming `Host` header. Upgrade requests are bridged with `hyper::upgrade::on()` on both sides and `copy_bidirectional()`.

## Result

Production mode works end to end through axum on SvelteKit 3.1 and `adapter-node` 6.

- SSR pages render and hydrate. A streamed `load()` promise arrives 2 s after the shell, so the proxy does not buffer.
- `load()` calls `fetch('/api/...')` and a `handleFetch` hook rewrites it to `API_ORIGIN` (`http://127.0.0.1:8080`, set by axum). The same relative URL works in the browser.
- The CSRF check passes same-origin form posts (200) and rejects foreign origins (403).
- SIGTERM and SIGINT drain axum first, so an in-flight streamed response completes, then axum forwards the signal to Node's process group, waits for Node to exit 0 and exits 0. New connections during the drain are refused.
- When Node dies, axum exits 1.

Development mode works for SSR, `/api` and streaming through axum. In a browser on `localhost:8080`, editing `+page.svelte` updates the heading through the proxied HMR websocket without a page reload. Component state such as the click counter resets on that update, and it resets the same way with the browser on Vite's own port, so the proxy is not the cause. `hmr.mjs` only proves the raw websocket, because Vite sends a bare client no updates.

## Findings

- SvelteKit 3 removed the `ORIGIN` environment variable. `adapter-node` derives the origin from `Host` plus `PROTOCOL_HEADER`, and the protocol defaults to `https`, so plain http behind axum fails CSRF with 403 until the protocol is passed. axum now sets `x-forwarded-proto: http` when absent and starts Node with `PROTOCOL_HEADER=x-forwarded-proto`, which also picks up Fly.io's `https`. A build-time `paths.origin` is the alternative.
- SvelteKit 3 replaces `$env/dynamic/private` with variables declared in `src/env.ts` through `defineEnvVars()`. `vite build` validates them, so `API_ORIGIN` needs a default although axum always sets it.
- `event.fetch` only attaches the page's cookies when the target host matches the page host. After the localhost rewrite it sends none, so `handleFetch` copies the `cookie` header itself.
- Node runs in its own process group, so a terminal Ctrl-C reaches only axum and axum decides when Node stops. Forwarding the signal before axum drains would let Node close connections that axum still proxies.
- axum answers `/api` before Node listens and proxies 502 in that gap. A health check must probe a SvelteKit page, not `/api`.
- SvelteKit skips the CSRF check in development, so foreign-origin posts succeed there by design.
- Vite rejects unknown `Host` headers with 403. `localhost` works, any other name needs `server.allowedHosts`.
- In development `pnpm exec vite` exits 1 on SIGINT. Starting Vite's binary directly would avoid the pnpm wrapper.
