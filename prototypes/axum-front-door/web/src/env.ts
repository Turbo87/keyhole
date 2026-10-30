import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	// `vite build` validates this too, so it needs a default although axum
	// always sets it when it starts Node.
	API_ORIGIN: {
		description: 'Where server-side code reaches axum',
		schema: (value) => value ?? 'http://127.0.0.1:8080'
	}
});
