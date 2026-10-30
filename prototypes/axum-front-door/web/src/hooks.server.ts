// PROTOTYPE: route server-side `fetch('/api/...')` to axum over localhost
// instead of out through the public origin.
import { API_ORIGIN } from '$app/env/private';
import type { HandleFetch } from '@sveltejs/kit';

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
	const url = new URL(request.url);
	if (url.origin === event.url.origin && url.pathname.startsWith('/api/')) {
		const rewritten = new Request(API_ORIGIN + url.pathname + url.search, request);
		// SvelteKit only attaches cookies when the target host matches the
		// page's host, which the localhost rewrite breaks.
		const cookie = event.request.headers.get('cookie');
		if (cookie) rewritten.headers.set('cookie', cookie);
		console.log(
			`[web] handleFetch ${url.pathname} -> ${rewritten.url} (cookie: ${cookie ?? '-'})`
		);
		return fetch(rewritten);
	}
	return fetch(request);
};
