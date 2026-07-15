// src/routes.ts
import { type RouteConfig, route } from '@react-router/dev/routes';

export default [
	// This maps the default URL path "/" to your Home view
	route('/', 'pages/home.tsx'),
] satisfies RouteConfig;
