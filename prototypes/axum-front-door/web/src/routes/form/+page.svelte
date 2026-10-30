<script lang="ts">
	let { form } = $props();
</script>

<h1>Form action</h1>
<form method="POST">
	<input name="name" value="pilot" />
	<button>submit</button>
</form>
{#if form}<p>{form.greeting} at {form.at}</p>{/if}
<p><a href="/">back to / (whoami should now show the session cookie)</a></p>
