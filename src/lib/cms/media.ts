/**
 * Uploaded files: stored in ./uploads under their storage key, listed in the media table.
 * Served at /_emdash/api/media/file/<key> (the address already saved in content), with HTTP
 * Range support so videos and PDFs stream.
 */
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { get, UPLOADS_DIR } from "./db";

export const MEDIA_PREFIX = "/_emdash/api/media/file/";
export const mediaFileUrl = (storageKey: string) => MEDIA_PREFIX + storageKey;

/** Storage keys are ULID names with an extension (no folders, no dots before the name). */
const KEY_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,200}$/;

const MIME_BY_EXT: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	pdf: "application/pdf",
	mp4: "video/mp4",
	m4v: "video/mp4",
	webm: "video/webm",
	mov: "video/quicktime",
	mp3: "audio/mpeg",
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	ppt: "application/vnd.ms-powerpoint",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	zip: "application/zip",
	txt: "text/plain; charset=utf-8",
	csv: "text/csv; charset=utf-8",
};

export const mimeFromName = (name: string) => MIME_BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

export function uploadPath(storageKey: string): string | undefined {
	if (!KEY_PATTERN.test(storageKey) || storageKey.includes("..")) return undefined;
	const p = path.join(UPLOADS_DIR, storageKey);
	return path.dirname(p) === UPLOADS_DIR ? p : undefined;
}

/** Content-Disposition with an ASCII fallback and the UTF-8 name. */
export function contentDisposition(kind: "inline" | "attachment", rawName: string): string {
	let name = rawName.split(/[\\/]/).pop() ?? "";
	name = name.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, "").trim() || "file";
	const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "file";
	return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Serve one uploaded file, honouring a single Range request. */
export function serveUpload(
	storageKey: string,
	request: Request,
	opts: { onlyType?: string; downloadName?: string; inline?: boolean } = {},
): Response {
	const file = uploadPath(storageKey);
	let size: number;
	try {
		if (!file) throw new Error();
		const st = statSync(file);
		if (!st.isFile()) throw new Error();
		size = st.size;
	} catch {
		return new Response("Not found", { status: 404 });
	}
	const row = get<{ mime_type: string; filename: string }>(`SELECT mime_type, filename FROM media WHERE storage_key = ?`, storageKey);
	const type = row?.mime_type || mimeFromName(storageKey);
	if (opts.onlyType && type !== opts.onlyType) return new Response("Not found", { status: 404 });

	const headers: Record<string, string> = {
		"Content-Type": type,
		"Accept-Ranges": "bytes",
		"Cache-Control": "public, max-age=31536000, immutable",
		"X-Content-Type-Options": "nosniff",
	};
	// images, video, audio and PDF open in the browser; anything else downloads with its real name
	const inline = opts.inline ?? /^(image\/(?!svg)|video\/|audio\/|application\/pdf)/.test(type);
	headers["Content-Disposition"] = contentDisposition(inline ? "inline" : "attachment", opts.downloadName || row?.filename || storageKey);
	if (type === "image/svg+xml") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
	if (type === "application/pdf") headers["X-Frame-Options"] = "SAMEORIGIN";

	const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
	if (range && size > 0) {
		let start = range[1] === "" ? NaN : Number(range[1]);
		let end = range[2] === "" ? NaN : Number(range[2]);
		if (Number.isNaN(start)) {
			start = Math.max(0, size - (Number.isNaN(end) ? size : end));
			end = size - 1;
		} else if (Number.isNaN(end)) end = size - 1;
		if (start > end || start >= size) {
			return new Response("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
		}
		end = Math.min(end, size - 1);
		const body = Readable.toWeb(createReadStream(file!, { start, end })) as ReadableStream;
		return new Response(request.method === "HEAD" ? null : body, {
			status: 206,
			headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
		});
	}
	const body = Readable.toWeb(createReadStream(file!)) as ReadableStream;
	return new Response(request.method === "HEAD" ? null : body, { headers: { ...headers, "Content-Length": String(size) } });
}
