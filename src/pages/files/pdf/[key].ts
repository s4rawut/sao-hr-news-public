import type { APIRoute } from "astro";

/**
 * GET /files/pdf/:key — serve an uploaded PDF inline so it can be shown in the page.
 *
 * EmDash's own media route sends PDFs as downloads (attachment + sandbox CSP). This route
 * only ever serves files whose stored type is application/pdf, and only plain media keys
 * (ULID-style names), so it can't be used to reach other files in storage.
 *
 * It supports HTTP Range requests and advertises Accept-Ranges so the browser's built-in
 * PDF viewer — and its Download button — works. An optional `?name=` query param (passed by
 * the linking component, which knows the original upload filename) sets a readable download
 * name; otherwise the storage key is used.
 */
const KEY_PATTERN = /^[0-9A-Z]{26}(\.[0-9A-Z]{26})?\.pdf$/i;

/** Build a Content-Disposition value with an ASCII fallback and a UTF-8 (RFC 5987) name. */
function contentDisposition(rawName: string): string {
	// Keep only the basename and drop anything non-printable (prevents header injection).
	let name = rawName.split(/[\\/]/).pop() ?? "";
	name = name.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, "").trim();
	if (!name) name = "document.pdf";
	if (!/\.pdf$/i.test(name)) name += ".pdf";
	const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "document.pdf";
	const encoded = encodeURIComponent(name);
	return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export const GET: APIRoute = async ({ params, locals, request, url }) => {
	const key = params.key ?? "";
	const storage = locals.emdash?.storage;
	if (!KEY_PATTERN.test(key) || !storage) {
		return new Response("Not found", { status: 404 });
	}

	try {
		const file = await storage.download(key);
		if (file.contentType !== "application/pdf") {
			await file.body?.cancel();
			return new Response("Not found", { status: 404 });
		}

		// Read the whole file into memory so we can answer Range requests and set a correct
		// Content-Length. Uploaded PDFs here are small (a few hundred KB).
		const bytes = file.body
			? new Uint8Array(await new Response(file.body).arrayBuffer())
			: new Uint8Array(0);
		const total = bytes.byteLength;

		const downloadName = url.searchParams.get("name") || key;

		const baseHeaders: Record<string, string> = {
			"Content-Type": "application/pdf",
			"Content-Disposition": contentDisposition(downloadName),
			"Accept-Ranges": "bytes",
			"Cache-Control": "public, max-age=3600",
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options": "SAMEORIGIN",
		};

		// Handle a single Range (bytes=start-end) — enough for browser PDF viewers.
		const range = request.headers.get("range");
		const match = range?.match(/^bytes=(\d*)-(\d*)$/);
		if (match && total > 0) {
			let start = match[1] === "" ? NaN : Number(match[1]);
			let end = match[2] === "" ? NaN : Number(match[2]);
			if (Number.isNaN(start)) {
				// suffix range: bytes=-N  → last N bytes
				start = Math.max(0, total - (Number.isNaN(end) ? total : end));
				end = total - 1;
			} else if (Number.isNaN(end)) {
				end = total - 1;
			}
			if (start > end || start >= total) {
				return new Response("Range Not Satisfiable", {
					status: 416,
					headers: { "Content-Range": `bytes */${total}`, "Accept-Ranges": "bytes" },
				});
			}
			end = Math.min(end, total - 1);
			const chunk = bytes.subarray(start, end + 1);
			return new Response(chunk, {
				status: 206,
				headers: {
					...baseHeaders,
					"Content-Range": `bytes ${start}-${end}/${total}`,
					"Content-Length": String(chunk.byteLength),
				},
			});
		}

		return new Response(bytes, {
			headers: { ...baseHeaders, "Content-Length": String(total) },
		});
	} catch {
		return new Response("Not found", { status: 404 });
	}
};
