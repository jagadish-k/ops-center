// src/routes.ts
import { type RouteConfig, route } from '@react-router/dev/routes';

export default [
	// Auth gate — shows OtpGateway or redirects based on role.
	route('/', 'pages/auth-gate.tsx'),
	// Admin / supervisor command surface (desktop).
	route('/control', 'pages/control-room.tsx'),
	// Field staff mobile surface.
	route('/field', 'pages/field-client.tsx'),
] satisfies RouteConfig;
