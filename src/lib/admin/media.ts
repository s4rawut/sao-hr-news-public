/** Media library: uploads saved to ./uploads and listed in the media table. */
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { all, get, nowIso, run, touch, ulid, UPLOADS_DIR } from "../cms/db";
import { mediaFileUrl, mimeFromName, uploadPath } from "../cms/media";
import { DEMO_MAX_UPLOAD, isDemo } from "./demo";

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // videos up to 200 MB

export interface MediaRow {
	id: string;
	filename: string;
	mime_type: string;
	size: number | null;
	width: number | null;
	height: number | null;
	alt: string | null;
	caption: string | null;
	storage_key: string;
	created_at: string;
}

/** Width/height of PNG, JPEG, GIF and WebP from the file header (no image library needed). */
export function imageSize(buf: Buffer): { width: number; height: number } | undefined {
	try {
		if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
		if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
		if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
			const kind = buf.toString("ascii", 12, 16);
			if (kind === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
			if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
			if (kind === "VP8L") {
				const b = buf.readUInt32LE(21);
				return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
			}
		}
		if (buf[0] === 0xff && buf[1] === 0xd8) {
			let i = 2;
			while (i < buf.length) {
				if (buf[i] !== 0xff) return undefined;
				const marker = buf[i + 1];
				const len = buf.readUInt16BE(i + 2);
				if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
					return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
				}
				i += 2 + len;
			}
		}
	} catch {
		/* unknown header */
	}
	return undefined;
}

const BLOCKED_EXT = new Set(["html", "htm", "js", "mjs", "php", "exe", "sh", "bat", "cmd", "svgz"]);

export function saveUpload(file: File, buf: Buffer, authorId: string): MediaRow {
	const name = (file.name || "file").normalize("NFC").replace(/[\\/]/g, "_").slice(0, 200);
	const ext = (name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
	if (!ext || BLOCKED_EXT.has(ext)) throw new Error(`ไม่รับไฟล์ชนิดนี้ (${name})`);
	if (buf.length > MAX_UPLOAD_BYTES) throw new Error(`ไฟล์ใหญ่เกิน 200 MB (${name})`);
	if (isDemo() && buf.length > DEMO_MAX_UPLOAD) throw new Error(`เว็บตัวอย่างอัปโหลดได้ไม่เกิน 5 MB (${name})`);
	const id = ulid();
	const key = `${id}.${ext}`;
	const mime = file.type && file.type !== "application/octet-stream" ? file.type : mimeFromName(name);
	mkdirSync(UPLOADS_DIR, { recursive: true });
	const path = uploadPath(key)!;
	writeFileSync(path, buf);
	const dims = mime.startsWith("image/") ? imageSize(buf) : undefined;
	run(
		`INSERT INTO media (id, filename, mime_type, size, width, height, alt, caption, storage_key, created_at, author_id, status)
		 VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 'ready')`,
		id,
		name,
		mime,
		buf.length,
		dims?.width ?? null,
		dims?.height ?? null,
		key,
		nowIso(),
		authorId,
	);
	touch();
	return get<MediaRow>(`SELECT * FROM media WHERE id = ?`, id)!;
}

export function listMedia(opts: { q?: string; kind?: string; page?: number; perPage?: number } = {}) {
	const where: string[] = ["1=1"];
	const params: unknown[] = [];
	if (opts.q) {
		where.push("(filename LIKE ? OR alt LIKE ?)");
		params.push(`%${opts.q}%`, `%${opts.q}%`);
	}
	if (opts.kind === "image") where.push("mime_type LIKE 'image/%'");
	else if (opts.kind === "video") where.push("mime_type LIKE 'video/%'");
	else if (opts.kind === "document") where.push("mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'video/%'");
	const perPage = opts.perPage ?? 48;
	const page = Math.max(1, opts.page ?? 1);
	const total = get<{ n: number }>(`SELECT count(*) n FROM media WHERE ${where.join(" AND ")}`, ...params)!.n;
	const rows = all<MediaRow>(
		`SELECT * FROM media WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
		...params,
		perPage,
		(page - 1) * perPage,
	);
	return { rows, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export const getMedia = (id: string) => get<MediaRow>(`SELECT * FROM media WHERE id = ?`, id);

export function updateMedia(id: string, alt: string, caption: string) {
	run(`UPDATE media SET alt = ?, caption = ? WHERE id = ?`, alt || null, caption || null, id);
	touch();
}

/** Where a file is used (content columns holding its id or storage key). */
export function mediaUsage(m: MediaRow): { collection: string; id: string; title: string }[] {
	const out: { collection: string; id: string; title: string }[] = [];
	const cols = all<{ slug: string }>(`SELECT slug FROM _emdash_collections`);
	for (const c of cols) {
		const fields = all<{ slug: string }>(
			`SELECT f.slug FROM _emdash_fields f JOIN _emdash_collections c ON c.id = f.collection_id WHERE c.slug = ? AND f.type IN ('image','file','portableText','repeater','json')`,
			c.slug,
		);
		if (!fields.length) continue;
		const cond = fields.map((f) => `"${f.slug}" LIKE ? OR "${f.slug}" LIKE ?`).join(" OR ");
		const params = fields.flatMap(() => [`%${m.id}%`, `%${m.storage_key}%`]);
		const titleCol = all<{ slug: string }>(
			`SELECT f.slug FROM _emdash_fields f JOIN _emdash_collections c ON c.id = f.collection_id WHERE c.slug = ? AND f.slug = 'title'`,
			c.slug,
		).length
			? "title"
			: "slug";
		for (const r of all<{ id: string; t: string }>(`SELECT id, "${titleCol}" AS t FROM "ec_${c.slug}" WHERE deleted_at IS NULL AND (${cond}) LIMIT 20`, ...params))
			out.push({ collection: c.slug, id: r.id, title: r.t ?? r.id });
	}
	const opt = all<{ name: string }>(`SELECT name FROM options WHERE name LIKE 'site:%' AND (value LIKE ? OR value LIKE ?)`, `%${m.id}%`, `%${m.storage_key}%`);
	for (const o of opt) out.push({ collection: "settings", id: o.name, title: "ตั้งค่าเว็บไซต์" });
	return out;
}

export function deleteMedia(id: string) {
	const m = getMedia(id);
	if (!m) return;
	run(`DELETE FROM media WHERE id = ?`, id);
	const p = uploadPath(m.storage_key);
	try {
		if (p) unlinkSync(p);
	} catch {
		/* already gone */
	}
	touch();
}

/** The value saved in an image/file field for a media item (same shape EmDash saved). */
export function mediaValue(m: MediaRow) {
	return {
		id: m.id,
		provider: "local",
		filename: m.filename,
		mimeType: m.mime_type,
		...(m.width ? { width: m.width, height: m.height } : {}),
		alt: m.alt ?? "",
		meta: { storageKey: m.storage_key },
		src: mediaFileUrl(m.storage_key),
	};
}
