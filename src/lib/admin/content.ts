/**
 * Creating, editing and deleting entries of any collection, driven by the field definitions.
 * Writes the same ec_* / content_taxonomies / _emdash_content_references rows EmDash used.
 */
import { all, get, ident, nowIso, run, touch, tx, ulid, type Row } from "../cms/db";
import { getCollectionDef, type CollectionDef, type FieldDef } from "../cms/schema";

export interface TaxonomyDef {
	name: string;
	label: string;
	hierarchical: boolean;
	collections: string[];
}

export function taxonomyDefs(): TaxonomyDef[] {
	return all<{ name: string; label: string; hierarchical: number; collections: string | null }>(
		`SELECT name, label, hierarchical, collections FROM _emdash_taxonomy_defs ORDER BY label`,
	).map((t) => ({ name: t.name, label: t.label, hierarchical: !!t.hierarchical, collections: t.collections ? JSON.parse(t.collections) : [] }));
}

export const taxonomiesFor = (collection: string) => taxonomyDefs().filter((t) => t.collections.includes(collection));

const table = (def: CollectionDef) => ident(`ec_${def.slug}`);

/** The column shown as an entry's name in lists. */
export function titleColumn(def: CollectionDef): string {
	const r = get<{ title_field: string | null }>(`SELECT title_field FROM _emdash_collections WHERE id = ?`, def.id);
	if (r?.title_field && def.fields.some((f) => f.slug === r.title_field)) return r.title_field;
	if (def.fields.some((f) => f.slug === "title")) return "title";
	return def.fields.find((f) => f.type === "string")?.slug ?? "slug";
}

export interface ListOptions {
	q?: string;
	status?: string;
	trash?: boolean;
	page?: number;
	perPage?: number;
	sort?: string;
}

export function listEntries(def: CollectionDef, opts: ListOptions = {}) {
	const tcol = titleColumn(def);
	const where: string[] = [opts.trash ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
	const params: unknown[] = [];
	if (opts.q) {
		where.push(`(${ident(tcol)} LIKE ? OR slug LIKE ?)`);
		params.push(`%${opts.q}%`, `%${opts.q}%`);
	}
	if (opts.status) {
		where.push(`status = ?`);
		params.push(opts.status);
	}
	const perPage = opts.perPage ?? 30;
	const page = Math.max(1, opts.page ?? 1);
	const total = get<{ n: number }>(`SELECT count(*) AS n FROM ${table(def)} WHERE ${where.join(" AND ")}`, ...params)!.n;
	const hasSort = def.fields.some((f) => f.slug === "sort_order");
	const order =
		opts.sort === "title"
			? `${ident(tcol)} COLLATE NOCASE ASC`
			: opts.sort === "order" && hasSort
				? `coalesce(sort_order, 999999) ASC, created_at DESC`
				: `updated_at DESC`;
	const rows = all<Row>(
		`SELECT id, slug, status, created_at, updated_at, published_at, draft_revision_id, ${ident(tcol)} AS _title
		 FROM ${table(def)} WHERE ${where.join(" AND ")} ORDER BY ${order}, id DESC LIMIT ? OFFSET ?`,
		...params,
		perPage,
		(page - 1) * perPage,
	);
	return { rows, total, page, pages: Math.max(1, Math.ceil(total / perPage)), titleColumn: tcol };
}

export function countEntries(def: CollectionDef) {
	return get<{ n: number }>(`SELECT count(*) AS n FROM ${table(def)} WHERE deleted_at IS NULL`)!.n;
}

const parseJson = (v: unknown) => {
	if (typeof v !== "string") return v;
	if (!(v.startsWith("{") || v.startsWith("["))) return v;
	try {
		return JSON.parse(v);
	} catch {
		return v;
	}
};

export interface EditableEntry {
	row: Row | null;
	values: Record<string, unknown>;
	terms: Record<string, string[]>;
	refs: Record<string, string[]>;
	hasPendingDraft: boolean;
}

export function loadEntry(def: CollectionDef, id: string | null): EditableEntry {
	if (!id) {
		const values: Record<string, unknown> = {};
		for (const f of def.fields) if (f.defaultValue !== null && f.defaultValue !== undefined) values[f.slug] = f.defaultValue;
		return { row: null, values, terms: {}, refs: {}, hasPendingDraft: false };
	}
	const row = get<Row>(`SELECT * FROM ${table(def)} WHERE id = ?`, id);
	if (!row) throw new Error("ไม่พบรายการนี้");
	const values: Record<string, unknown> = {};
	for (const f of def.fields) values[f.slug] = parseJson(row[f.slug]);
	// unpublished changes saved in EmDash as a draft revision: load them so nothing is lost
	let hasPendingDraft = false;
	if (row.draft_revision_id) {
		const rev = get<{ data: string }>(`SELECT data FROM revisions WHERE id = ?`, row.draft_revision_id);
		if (rev) {
			try {
				const data = JSON.parse(rev.data) as Record<string, unknown>;
				for (const f of def.fields) if (f.slug in data) values[f.slug] = data[f.slug];
				hasPendingDraft = true;
			} catch {
				/* ignore broken revision */
			}
		}
	}
	const terms: Record<string, string[]> = {};
	for (const t of all<{ name: string; id: string }>(
		`SELECT t.name, t.id FROM content_taxonomies ct JOIN taxonomies t ON t.id = ct.taxonomy_id WHERE ct.collection = ? AND ct.entry_id = ?`,
		def.slug,
		id,
	))
		(terms[t.name] ??= []).push(t.id);
	const refs: Record<string, string[]> = {};
	const group = (row.translation_group as string) || id;
	for (const f of def.fields.filter((x) => x.type === "reference")) {
		const target = f.validation.targetCollection;
		const relation = f.validation.relation;
		const tdef = target ? getCollectionDef(target) : undefined;
		if (!tdef || !relation) continue;
		refs[f.slug] = all<{ id: string }>(
			`SELECT c.id FROM _emdash_content_references r JOIN _emdash_relations rel ON rel.id = r.relation_id AND rel.slug = ?
			 JOIN ${table(tdef)} c ON coalesce(c.translation_group, c.id) = r.child_group
			 WHERE r.parent_group = ? ORDER BY r.sort_order`,
			relation,
			group,
		).map((r) => r.id);
	}
	return { row, values, terms, refs, hasPendingDraft };
}

/* ---------- reading the submitted form ---------- */

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** How a stored date shows in the form (date widget: day only; otherwise minutes). */
export function dateInputValue(v: unknown, dateOnly: boolean): string {
	if (!v) return "";
	const d = new Date(String(v));
	if (Number.isNaN(d.getTime())) return "";
	return dateOnly ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 16);
}

/**
 * Read one field from the form. `before` is the stored value: a field the person did not change
 * keeps it exactly (empty text stays "" or NULL as it was, a date keeps its time, a checkbox
 * that was never set stays NULL).
 */
function readField(f: FieldDef, form: FormData, before: unknown): unknown {
	const name = `f:${f.slug}`;
	const rawUntrimmed = str(form.get(name));
	const raw = rawUntrimmed.trim();
	switch (f.type) {
		case "boolean": {
			const on = form.get(name) === "on" || raw === "1";
			if (!on && (before === null || before === undefined)) return null;
			return on ? 1 : 0;
		}
		case "integer": {
			if (raw === "") return null;
			const n = Number.parseInt(raw, 10);
			if (Number.isNaN(n)) throw new Error(`"${f.label}" ต้องเป็นตัวเลขจำนวนเต็ม`);
			return n;
		}
		case "number": {
			if (raw === "") return null;
			const n = Number(raw);
			if (Number.isNaN(n)) throw new Error(`"${f.label}" ต้องเป็นตัวเลข`);
			return n;
		}
		case "datetime": {
			if (raw === "") return before === "" ? "" : null;
			if (before && raw === dateInputValue(before, f.widget === "thai-date:date")) return before;
			if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`;
			if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return `${raw}:00.000Z`;
			if (!Number.isNaN(Date.parse(raw))) return new Date(raw).toISOString();
			throw new Error(`"${f.label}" วันที่ไม่ถูกต้อง`);
		}
		case "image":
		case "file":
		case "portableText":
		case "repeater":
		case "json": {
			if (raw === "" || raw === "null") return null;
			try {
				const parsed = JSON.parse(raw);
				if ((f.type === "repeater" || f.type === "portableText") && Array.isArray(parsed) && parsed.length === 0) return before === "[]" ? "[]" : null;
				// unchanged → keep the stored text byte for byte
				if (typeof before === "string") {
					try {
						if (JSON.stringify(JSON.parse(before)) === JSON.stringify(parsed)) return before;
					} catch {
						/* stored value was not JSON */
					}
				}
				return JSON.stringify(parsed);
			} catch {
				throw new Error(`"${f.label}" ข้อมูลไม่ถูกต้อง`);
			}
		}
		case "reference":
			return undefined; // stored as relations
		default:
			if (raw === "") return before === "" ? "" : null;
			// keep spaces as typed when the text is otherwise the same as before
			return typeof before === "string" && before.trim() === raw ? before : rawUntrimmed;
	}
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

/** Make a URL slug: Thai and Latin letters and digits, words joined by "-". */
export function slugify(text: string): string {
	return (
		text
			.normalize("NFC")
			.toLowerCase()
			.replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 90)
			.replace(/-+$/g, "") || ulid().toLowerCase()
	);
}

function uniqueSlug(def: CollectionDef, base: string, selfId: string | null): string {
	let slug = base;
	for (let i = 2; get(`SELECT 1 FROM ${table(def)} WHERE slug = ? AND id IS NOT ? AND locale = 'en'`, slug, selfId); i++) slug = `${base}-${i}`;
	return slug;
}

/** A stored UTC time as the Bangkok "YYYY-MM-DDTHH:mm" shown in the form. */
export const bangkokInput = (v: unknown) =>
	v ? new Date(new Date(String(v)).getTime() + 7 * 3_600_000).toISOString().slice(0, 16) : "";

export interface SaveResult {
	id: string;
	created: boolean;
}

/** Save the edit form. action: "publish" | "draft" | "unpublish". */
export function saveEntry(def: CollectionDef, id: string | null, form: FormData, actorId: string): SaveResult {
	const existing = id ? get<Row>(`SELECT * FROM ${table(def)} WHERE id = ?`, id) : undefined;
	if (id && !existing) throw new Error("ไม่พบรายการนี้");
	const values: Record<string, unknown> = {};
	for (const f of def.fields) {
		const v = readField(f, form, existing?.[f.slug]);
		if (v === undefined) continue;
		if (f.required && (isEmpty(v) || (typeof v === "string" && !v.trim()))) throw new Error(`กรุณากรอก "${f.label}"`);
		values[f.slug] = v;
	}
	const action = str(form.get("_action")) || "publish";
	const tcol = titleColumn(def);
	const wantedSlug = str(form.get("_slug")).trim();
	const slugBase =
		wantedSlug && wantedSlug === existing?.slug
			? wantedSlug
			: wantedSlug
				? slugify(wantedSlug)
				: (existing?.slug as string) || slugify(String(values[tcol] ?? ""));
	const now = nowIso();
	const status = action === "draft" || action === "unpublish" ? "draft" : "published";
	const publishedAtInput = str(form.get("_published_at")).trim();

	return tx(() => {
		const entryId = id ?? ulid();
		const slug = uniqueSlug(def, slugBase, id);
		let publishedAt: string | null = (existing?.published_at as string) ?? null;
		if (publishedAtInput && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(publishedAtInput) && publishedAtInput !== bangkokInput(publishedAt)) {
			// typed as Bangkok time; unchanged keeps the stored value with its seconds
			publishedAt = new Date(`${publishedAtInput}:00+07:00`).toISOString();
		}
		if (status === "published" && !publishedAt) publishedAt = now;
		const cols = Object.keys(values);
		if (existing) {
			run(
				`UPDATE ${table(def)} SET ${cols.map((c) => `${ident(c)} = ?`).join(", ")}${cols.length ? "," : ""}
				 slug = ?, status = ?, published_at = ?, updated_at = ?, draft_revision_id = NULL, version = coalesce(version, 1) + 1 WHERE id = ?`,
				...cols.map((c) => values[c]),
				slug,
				status,
				publishedAt,
				now,
				entryId,
			);
		} else {
			run(
				`INSERT INTO ${table(def)} (id, slug, status, author_id, created_at, updated_at, published_at, version, locale, translation_group${cols.map((c) => `, ${ident(c)}`).join("")})
				 VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'en', ?${cols.map(() => ", ?").join("")})`,
				entryId,
				slug,
				status,
				actorId,
				now,
				now,
				publishedAt,
				entryId,
				...cols.map((c) => values[c]),
			);
		}
		// taxonomies
		for (const t of taxonomiesFor(def.slug)) {
			const ids = form.getAll(`t:${t.name}`).map(String).filter(Boolean);
			run(
				`DELETE FROM content_taxonomies WHERE collection = ? AND entry_id = ? AND taxonomy_id IN (SELECT id FROM taxonomies WHERE name = ?)`,
				def.slug,
				entryId,
				t.name,
			);
			for (const tid of ids) {
				if (!get(`SELECT 1 FROM taxonomies WHERE id = ? AND name = ?`, tid, t.name)) continue;
				run(
					`INSERT OR IGNORE INTO content_taxonomies (collection, entry_id, taxonomy_id, status, locale, published_at, created_at) VALUES (?, ?, ?, ?, 'en', ?, ?)`,
					def.slug,
					entryId,
					tid,
					status,
					publishedAt,
					now,
				);
			}
		}
		run(`UPDATE content_taxonomies SET status = ?, published_at = ? WHERE collection = ? AND entry_id = ?`, status, publishedAt, def.slug, entryId);
		// references
		const group = (existing?.translation_group as string) || entryId;
		for (const f of def.fields.filter((x) => x.type === "reference")) {
			const relation = get<{ id: string }>(`SELECT id FROM _emdash_relations WHERE slug = ?`, f.validation.relation);
			const tdef = f.validation.targetCollection ? getCollectionDef(f.validation.targetCollection) : undefined;
			if (!relation || !tdef) continue;
			const picked = str(form.get(`r:${f.slug}`))
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			run(`DELETE FROM _emdash_content_references WHERE relation_id = ? AND parent_group = ?`, relation.id, group);
			picked.forEach((cid, i) => {
				const child = get<{ id: string; translation_group: string | null }>(`SELECT id, translation_group FROM ${table(tdef)} WHERE id = ?`, cid);
				if (!child) return;
				run(
					`INSERT OR IGNORE INTO _emdash_content_references (id, relation_id, parent_group, child_group, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
					ulid(),
					relation.id,
					group,
					child.translation_group ?? child.id,
					i,
					now,
				);
			});
		}
		touch();
		return { id: entryId, created: !existing };
	});
}

export function trashEntry(def: CollectionDef, id: string) {
	run(`UPDATE ${table(def)} SET deleted_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), id);
	run(`UPDATE content_taxonomies SET deleted_at = ? WHERE collection = ? AND entry_id = ?`, nowIso(), def.slug, id);
	touch();
}

export function restoreEntry(def: CollectionDef, id: string) {
	run(`UPDATE ${table(def)} SET deleted_at = NULL, updated_at = ? WHERE id = ?`, nowIso(), id);
	run(`UPDATE content_taxonomies SET deleted_at = NULL WHERE collection = ? AND entry_id = ?`, def.slug, id);
	touch();
}

export function purgeEntry(def: CollectionDef, id: string) {
	tx(() => {
		const row = get<{ translation_group: string | null }>(`SELECT translation_group FROM ${table(def)} WHERE id = ? AND deleted_at IS NOT NULL`, id);
		if (!row) return;
		const group = row.translation_group ?? id;
		run(`DELETE FROM content_taxonomies WHERE collection = ? AND entry_id = ?`, def.slug, id);
		run(`DELETE FROM _emdash_content_references WHERE parent_group = ? OR child_group = ?`, group, group);
		run(`DELETE FROM revisions WHERE collection = ? AND entry_id = ?`, def.slug, id);
		run(`DELETE FROM ${table(def)} WHERE id = ?`, id);
	});
	touch();
}

export function duplicateEntry(def: CollectionDef, id: string, actorId: string): string {
	const row = get<Row>(`SELECT * FROM ${table(def)} WHERE id = ?`, id);
	if (!row) throw new Error("ไม่พบรายการนี้");
	const newId = ulid();
	const now = nowIso();
	const tcol = titleColumn(def);
	const copy: Row = { ...row, id: newId, translation_group: newId, status: "draft", created_at: now, updated_at: now, published_at: null, author_id: actorId, live_revision_id: null, draft_revision_id: null, version: 1, deleted_at: null };
	if (typeof copy[tcol] === "string") copy[tcol] = `${copy[tcol]} (สำเนา)`;
	copy.slug = uniqueSlug(def, `${row.slug || newId}-copy`, null);
	const cols = Object.keys(copy);
	tx(() => {
		run(`INSERT INTO ${table(def)} (${cols.map(ident).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...cols.map((c) => copy[c]));
		run(
			`INSERT INTO content_taxonomies (collection, entry_id, taxonomy_id, status, locale, created_at) SELECT collection, ?, taxonomy_id, 'draft', locale, ? FROM content_taxonomies WHERE collection = ? AND entry_id = ?`,
			newId,
			now,
			def.slug,
			id,
		);
	});
	touch();
	return newId;
}

/** Options for a reference picker: every entry of the target collection. */
export function referenceChoices(target: string) {
	const tdef = getCollectionDef(target);
	if (!tdef) return [];
	const tcol = titleColumn(tdef);
	return all<{ id: string; title: string; status: string }>(
		`SELECT id, ${ident(tcol)} AS title, status FROM ${table(tdef)} WHERE deleted_at IS NULL ORDER BY ${tdef.fields.some((f) => f.slug === "sort_order") ? "coalesce(sort_order, 999999)," : ""} ${ident(tcol)} COLLATE NOCASE`,
	);
}
