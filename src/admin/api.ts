/** Small helpers for the admin JSON endpoints. */
export const json = (data: unknown, status = 200) =>
	new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export const fail = (message: string, status = 400) => json({ error: message }, status);

export const isSecure = (url: URL) => url.protocol === "https:";
