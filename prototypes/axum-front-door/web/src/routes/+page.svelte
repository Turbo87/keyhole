<script lang="ts">
	let { data } = $props();
	let count = $state(0);
</script>

<h1>PROTOTYPE: axum in front of SvelteKit</h1>
<p>SvelteKit sees origin <code>{data.origin}</code></p>
<p>SSR load via /api/hello: <code>{JSON.stringify(data.hello)}</code></p>
<p>SSR load via /api/whoami: <code>{JSON.stringify(data.whoami)}</code></p>
<button onclick={() => count++}>clicked {count} times (hydration check)</button>
<ul>
	<li><a href="/stream">streamed SSR</a></li>
	<li><a href="/form">form action (CSRF check)</a></li>
</ul>
