import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const name = (await request.formData()).get('name');
		cookies.set('session', 'prototype', { path: '/', httpOnly: true });
		return { greeting: `hello ${name}`, at: new Date().toISOString() };
	}
};
