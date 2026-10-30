// PROTOTYPE: connects to Vite's HMR websocket through axum and prints messages.
const url = process.argv[2] ?? 'ws://localhost:8080/';
const ws = new WebSocket(url, 'vite-hmr');
ws.onopen = () => console.log(`[hmr] connected to ${url}`);
ws.onmessage = (m) => console.log(`[hmr] ${String(m.data).slice(0, 160)}`);
ws.onerror = (e) => console.log(`[hmr] error ${e.message ?? e.type}`);
ws.onclose = (e) => console.log(`[hmr] closed ${e.code}`);
setTimeout(() => ws.close(), Number(process.argv[3] ?? 4000));
