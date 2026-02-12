import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			// Output directory for the build
			out: 'build',
			// Don't use the default polyfills
			polyfill: false,
		}),
		csrf: {
			checkOrigin: false
		}
	}
};

export default config;
