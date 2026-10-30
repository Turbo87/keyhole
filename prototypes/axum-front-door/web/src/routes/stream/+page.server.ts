import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	return {
		fast: new Date().toISOString(),
		slow: fetch('/api/slow?ms=2000').then((r) => r.json())
	};
};
