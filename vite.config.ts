import { reactRouter } from '@react-router/dev/vite';
import { VitePWA } from 'vite-plugin-pwa'; // Import PWA plugin
import netlifyReactRouter from '@netlify/vite-plugin-react-router';
import tsconfigPaths from 'vite-tsconfig-paths';

import { defineConfig, loadEnv } from 'vite';

import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	return {
		base: env.BASE_URL || '/',
		plugins: [
			tsconfigPaths(),
			tailwindcss(),
			reactRouter(),
			netlifyReactRouter(),
			VitePWA({
				registerType: 'autoUpdate',
				manifest: {
					name: 'Stadium Ops Grid Matrix',
					short_name: 'StadiumOps',
					description: 'Mission-critical incident management and tactical coordination for stadium operations.',
					theme_color: '#020617',
					background_color: '#020617',
					display: 'standalone',
					orientation: 'portrait',
					start_url: '/',
					icons: [
						{
							src: '/icons.svg',
							sizes: 'any',
							type: 'image/svg+xml',
							purpose: 'any',
						},
						{
							src: '/favicon.svg',
							sizes: 'any',
							type: 'image/svg+xml',
							purpose: 'maskable',
						},
					],
				},
			}),
		],
		server: {
			port: env.APP_PORT ? Number(env.APP_PORT) : 5173,
		},
	};
});
