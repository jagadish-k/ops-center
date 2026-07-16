# Operational Telemetry Alerts & Log Monitoring

This blueprint configures tracking endpoints and dashboard metrics to measure system performance and catch edge function runtime failures early.

---

## 1. Serverless Edge Gateway Error Traps (`netlify/edge-functions/telemetry-monitor.ts`)

```typescript
// netlify/edge-functions/telemetry-monitor.ts
import { Context } from '@netlify/edge-functions';

export default async (req: Request, context: Context) => {
	const monitoringTimestamp = new Date().toISOString();

	// Intercept standard instrumentation tracking requests
	if (req.method !== 'POST') {
		return new Response('Method Blocked', { status: 405 });
	}

	try {
		const errorPayloadGrid = await req.json();

		// Structure alert details cleanly for upstream parsing engines
		const formattedDiagnosticLog = {
			serviceSource: 'STADIUM_OPS_AI_GATEWAY',
			timestamp: monitoringTimestamp,
			severity: errorPayloadGrid.severity || 'WARN',
			tenantId: errorPayloadGrid.tenantId || 'UNASSIGNED',
			exceptionMessage: errorPayloadGrid.message || 'Generic operational pipeline delay trace',
			environmentContext: Deno.env.get('VITE_APP_ENVIRONMENT') || 'staging',
		};

		// Emit standardized logs to standard error/out for ingestion tools
		console.error(`🚨 [SYSTEM TELEMETRY TRACE] ${JSON.stringify(formattedDiagnosticLog)}`);

		return new Response(JSON.stringify({ telemetryLogged: true }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err: any) {
		return new Response(JSON.stringify({ runtimeTelemetryFailure: err.message }), { status: 500 });
	}
};

export const config = {
	path: '/api/telemetry/report-exception',
};
```
