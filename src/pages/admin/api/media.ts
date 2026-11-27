import type { APIRoute } from "astro";
import { listMedia, mediaValue, saveUpload } from "../../../lib/admin/media";
import { audit } from "../../../lib/admin/auth";
import { fail, json } from "../../../admin/api";

/** GET: list (q, kind=image|video|document, page). POST: upload files (field "files"). */
export const GET: APIRoute = ({ url }) => {
	const r = listMedia({
		q: url.searchParams.get("q") ?? undefined,
		kind: url.searchParams.get("kind") ?? undefined,
		page: Number(url.searchParams.get("page") ?? 1),
		perPage: 40,
	});
	return json({ ...r, rows: r.rows.map((m) => ({ ...mediaValue(m), size: m.size, createdAt: m.created_at })) });
};

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const form = await request.formData();
		const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
		if (!files.length) return fail("ไม่มีไฟล์");
		const out = [];
		for (const f of files) {
			const m = saveUpload(f, Buffer.from(await f.arrayBuffer()), locals.user!.id);
			audit(locals.user!.id, "media.upload", "media", m.id, { filename: m.filename });
			out.push(mediaValue(m));
		}
		return json({ items: out });
	} catch (e) {
		return fail((e as Error).message || "อัปโหลดไม่สำเร็จ");
	}
};
