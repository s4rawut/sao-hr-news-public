import type { APIRoute } from "astro";
import { serveUpload } from "../../../lib/cms/media";

/**
 * GET /files/pdf/:key — serve an uploaded PDF inline so it can be shown in the page.
 *
 * This route
 * only ever serves files whose stored type is application/pdf, and only plain media keys
 * (ULID-style names), so it can't be used to reach other files in storage.
 *
 * It supports HTTP Range requests and advertises Accept-Ranges so the browser's built-in
 * PDF viewer — and its Download button — works. An optional `?name=` query param (passed by
 * the linking component, which knows the original upload filename) sets a readable download
 * name; otherwise the storage key is used.
 */
const KEY_PATTERN = /^[0-9A-Z]{26}(\.[0-9A-Z]{26})?\.pdf$/i;

export const GET: APIRoute = async ({ params, request, url }) => {
	const key = params.key ?? "";
	if (!KEY_PATTERN.test(key)) return new Response("Not found", { status: 404 });
	const res = serveUpload(key, request, { onlyType: "application/pdf", inline: true, downloadName: url.searchParams.get("name") || key });
	res.headers.set("Cache-Control", "public, max-age=3600");
	return res;
};
