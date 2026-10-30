<script lang="ts">
	let { data } = $props();
</script>

<h1>Streamed SSR</h1>
<p>fast: {data.fast}</p>
{#await data.slow}
	<p>slow: loading…</p>
{:then slow}
	<p>slow: {JSON.stringify(slow)} at {new Date().toISOString()}</p>
{/await}
