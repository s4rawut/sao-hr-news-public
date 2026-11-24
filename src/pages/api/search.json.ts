import type { APIRoute } from "astro";
import { searchSite } from "../../utils/search";

export const GET: APIRoute = async ({ url }) => {
	const q = (url.searchParams.get("q") ?? "").slice(0, 100);
	const results = await searchSite(q, 8);
	return new Response(JSON.stringify({ q, results }), {
		headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
	});
};
