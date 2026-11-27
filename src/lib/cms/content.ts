/**
 * Reading published content: the same functions (names and result shapes) the pages used from
 * EmDash, implemented directly on the ec_* tables.
 */
import { all, get, ident, type Row } from "./db";
import { getCollectionDef } from "./schema";

export interface CacheHint {
	tags?: string[];
}

export interface ContentEntry<T = Record<string, any>> {
	/** slug (or the database id when there is no slug) — used in URLs */
	id: string;
	data: T & { id: string; slug?: string | null };
	/** EmDash visual-editing attributes; kept so `{...entry.edit.title}` still works (always empty) */
	edit: Record<string, Record<string, unknown>>;
}

const LOCAL_MEDIA_FILE_PREFIX = "/_emdash/api/media/file/";

/** Spreading any property gives no attributes (visual editing is not part of the new admin). */
export const noEdit: Record<string, Record<string, unknown>> = new Proxy(
	{},
	{ get: (_t, key) => (typeof key === "string" ? {} : undefined) },
);

const INCLUDE_IN_DATA: Record<string, string> = {
	id: "id",
	status: "status",
	author_id: "authorId",
	created_at: "createdAt",
	updated_at: "updatedAt",
	published_at: "publishedAt",
	scheduled_at: "scheduledAt",
	locale: "locale",
};
const DATE_COLUMNS = new Set(["created_at", "updated_at", "published_at", "scheduled_at"]);
const SYSTEM_COLUMNS = new Set([
	"primary_byline_id",
	"deleted_at",
	"version",
	"live_revision_id",
	"draft_revision_id",
	"translation_group",
]);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Local media values get a usable src, as EmDash's loader did. */
function normalizeLocalMedia(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normalizeLocalMedia);
	if (!isRecord(value)) return value;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) out[k] = normalizeLocalMedia(v);
	if (out.provider === "local" && typeof out.src === "string" && out.src) {
		const src = out.src;
		if (!src.startsWith("/") && !/^[a-z][a-z\d+\-.]*:/i.test(src)) {
			if (!out.id) out.id = src;
			out.src = LOCAL_MEDIA_FILE_PREFIX + src;
		}
	}
	return out;
}

export function mapRowToData(row: Row, booleanFields: ReadonlySet<string>): Record<string, any> {
	const data: Record<string, any> = {};
	for (const [key, value] of Object.entries(row)) {
		if (key in INCLUDE_IN_DATA) {
			data[INCLUDE_IN_DATA[key]] = DATE_COLUMNS.has(key) ? (typeof value === "string" ? new Date(value) : null) : value;
			continue;
		}
		if (SYSTEM_COLUMNS.has(key)) continue;
		if (booleanFields.has(key) && (value === 0 || value === 1)) {
			data[key] = Boolean(value);
			continue;
		}
		if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
			try {
				data[key] = normalizeLocalMedia(JSON.parse(value));
			} catch {
				data[key] = value;
			}
		} else data[key] = value;
	}
	return data;
}

export function rowToEntry<T = Record<string, any>>(collection: string, row: Row): ContentEntry<T> {
	const def = getCollectionDef(collection);
	return {
		id: String(row.slug || row.id),
		data: mapRowToData(row, def?.booleanFields ?? new Set()) as ContentEntry<T>["data"],
		edit: noEdit,
	};
}

/**
 * EmDash put each entry's terms on data.terms ({ category: [...], tag: [...] }); pages rely on it.
 */
function hydrateTerms(collection: string, entries: ContentEntry[]) {
	if (!entries.length) return;
	const ids = entries.map((e) => e.data.id);
	const byEntry = new Map<string, Record<string, any[]>>(ids.map((id) => [id, {}]));
	for (let i = 0; i < ids.length; i += 500) {
		const chunk = ids.slice(i, i + 500);
		const rows = all<{ entry_id: string; id: string; name: string; slug: string; label: string; parent_id: string | null; locale: string; translation_group: string | null; sort_order: number }>(
			`SELECT ct.entry_id, t.id, t.name, t.slug, t.label, t.parent_id, t.locale, t.translation_group, t.sort_order
			 FROM content_taxonomies ct JOIN taxonomies t ON t.id = ct.taxonomy_id
			 WHERE ct.collection = ? AND ct.entry_id IN (${chunk.map(() => "?").join(",")}) ORDER BY t.sort_order, t.label`,
			collection,
			...chunk,
		);
		for (const r of rows) {
			const terms = byEntry.get(r.entry_id)!;
			(terms[r.name] ??= []).push({
				id: r.id,
				name: r.name,
				slug: r.slug,
				label: r.label,
				parentId: r.parent_id ?? undefined,
				children: [],
				locale: r.locale,
				translationGroup: r.translation_group,
			});
		}
	}
	for (const e of entries) (e.data as Record<string, unknown>).terms = byEntry.get(e.data.id) ?? {};
}
const tableOf = (collection: string) => {
	const def = getCollectionDef(collection);
	if (!def) return undefined;
	return ident(`ec_${def.slug}`);
};

const PUBLISHED = `status = 'published' AND deleted_at IS NULL`;

export interface CollectionQuery {
	limit?: number;
	orderBy?: Record<string, "asc" | "desc">;
	/** { taxonomyName: termSlug | termSlug[] } — entries tagged with that term */
	where?: Record<string, string | string[]>;
}

export async function getEmDashCollection<T = Record<string, any>>(
	collection: string,
	options: CollectionQuery = {},
): Promise<{ entries: ContentEntry<T>[]; cacheHint?: CacheHint; error?: Error }> {
	const table = tableOf(collection);
	if (!table) return { entries: [] };
	const params: unknown[] = [];
	let where = PUBLISHED;
	for (const [taxonomy, value] of Object.entries(options.where ?? {})) {
		const slugs = Array.isArray(value) ? value : [value];
		if (!slugs.length) continue;
		where += ` AND id IN (SELECT ct.entry_id FROM content_taxonomies ct JOIN taxonomies t ON t.id = ct.taxonomy_id
			WHERE ct.collection = ? AND t.name = ? AND t.slug IN (${slugs.map(() => "?").join(",")}))`;
		params.push(collection, taxonomy, ...slugs);
	}
	const order = Object.entries(options.orderBy ?? { created_at: "desc" })
		.filter(([f]) => /^[a-z_][a-z0-9_]*$/i.test(f))
		.map(([f, dir]) => `${ident(f)} ${dir === "asc" ? "ASC" : "DESC"}`);
	order.push("id DESC");
	const limit = Math.max(1, Math.min(options.limit ?? 50, 5000));
	try {
		const rows = all(`SELECT * FROM ${table} WHERE ${where} ORDER BY ${order.join(", ")} LIMIT ${limit}`, ...params);
		const entries = rows.map((r) => rowToEntry<T>(collection, r));
		hydrateTerms(collection, entries as ContentEntry[]);
		return { entries };
	} catch (error) {
		return { entries: [], error: error as Error };
	}
}

export async function getEmDashEntry<T = Record<string, any>>(
	collection: string,
	idOrSlug: string | undefined,
): Promise<{ entry: ContentEntry<T> | null; cacheHint?: CacheHint; error?: Error }> {
	const table = tableOf(collection);
	if (!table || !idOrSlug) return { entry: null };
	const row = get(`SELECT * FROM ${table} WHERE ${PUBLISHED} AND (slug = ? OR id = ?) LIMIT 1`, idOrSlug, idOrSlug);
	if (!row) return { entry: null };
	const entry = rowToEntry<T>(collection, row);
	hydrateTerms(collection, [entry as ContentEntry]);
	return { entry };
}

/**
 * Entries picked in a reference field (stored in _emdash_content_references by relation),
 * in the order they were picked.
 */
export async function getEmDashReferences<T = Record<string, any>>(
	collection: string,
	id: string,
	field: string,
	options: { limit?: number } = {},
): Promise<{ entries: ContentEntry<T>[]; cacheHint?: CacheHint }> {
	const def = getCollectionDef(collection);
	const f = def?.fields.find((x) => x.slug === field && x.type === "reference");
	const target = f?.validation.targetCollection;
	const relationSlug = f?.validation.relation;
	if (!def || !f || !target || !relationSlug) return { entries: [] };
	const table = tableOf(collection);
	const targetTable = tableOf(target);
	if (!table || !targetTable) return { entries: [] };
	const parent = get<{ id: string; translation_group: string | null }>(
		`SELECT id, translation_group FROM ${table} WHERE (id = ? OR slug = ?) AND deleted_at IS NULL LIMIT 1`,
		id,
		id,
	);
	if (!parent) return { entries: [] };
	const rows = all(
		`SELECT c.* FROM _emdash_content_references r
		 JOIN _emdash_relations rel ON rel.id = r.relation_id AND rel.slug = ?
		 JOIN ${targetTable} c ON coalesce(c.translation_group, c.id) = r.child_group
		 WHERE r.parent_group = ? AND c.status = 'published' AND c.deleted_at IS NULL
		 ORDER BY r.sort_order, r.created_at LIMIT ?`,
		relationSlug,
		parent.translation_group ?? parent.id,
		Math.max(1, options.limit ?? 50),
	);
	return { entries: rows.map((r) => rowToEntry<T>(target, r)) };
}
