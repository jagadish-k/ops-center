import { Context } from '@netlify/functions';

export default async (request: Request, context: Context) => {
	return new Response(JSON.stringify({ message: 'Hello from Netlify Functions!' }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
};
