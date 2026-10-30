import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
	const hello = await (await fetch('/api/hello')).json();
	const whoami = await (await fetch('/api/whoami')).json();
	return { hello, whoami, origin: url.origin };
};
