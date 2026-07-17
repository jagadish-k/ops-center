import { reactRouter } from '@react-router/dev/vite';
import { VitePWA } from 'vite-plugin-pwa'; // Import PWA plugin
import netlifyReactRouter from '@netlify/vite-plugin-react-router';
import tsconfigPaths from 'vite-tsconfig-paths';

import { defineConfig, loadEnv } from 'vite';

import tailwindcss from '@tailwindcss/vite';
import mkcert from 'vite-plugin-mkcert';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	return {
		resolve: {
			tsconfigPaths: true,
		},
		base: env.BASE_URL || '/',
		plugins: [
			mkcert(),
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
			host: 'stadops.local',
			allowedHosts: [
				// Required in modern Vite versions to permit the domain
				'stadops.local',
			],
			hmr: {
				host: 'stadops.local', // Ensures Hot Module Replacement works over the custom domain
			},
			port: env.APP_PORT ? Number(env.APP_PORT) : 5173,
			// Proxy /api/* to netlify dev (port 8888) so frontend requests hit the
			// Netlify Functions during local development. If netlify dev isn't
			// running, requests will fail with ECONNREFUSED and the client-side
			// mock data fallback kicks in (see src/lib/mockData.ts).
			proxy: {
				'/api': {
					target: env.API_PROXY_TARGET ?? 'http://localhost:8888',
					changeOrigin: true,
					// Don't fail the build if the API target is down — let the
					// client's mock fallback handle it.
					configure: (proxy) => {
						proxy.on('error', (err) => {
							// Suppress noisy ECONNREFUSED logs when running UI-only dev.
							if ((err as NodeJS.ErrnoException).code !== 'ECONNREFUSED') {
								console.error('[vite proxy]', err);
							}
						});
					},
				},
			},
		},
	};
});
