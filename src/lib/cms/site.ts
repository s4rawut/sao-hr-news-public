/** Menus, site settings, SEO helpers and small utilities the pages used from EmDash. */
import { all, get } from "./db";
import type { CacheHint, ContentEntry } from "./content";
import { getCollectionDef } from "./schema";

export interface MenuItem {
	id: string;
	label: string;
	url: string;
	target?: string | null;
	titleAttr?: string | null;
	cssClasses?: string | null;
	type: string;
	children: MenuItem[];
}

export interface Menu {
	id: string;
	name: string;
	label: string;
	items: MenuItem[];
}

interface MenuItemRow {
	id: string;
	parent_id: string | null;
	sort_order: number;
	type: string;
	reference_collection: string | null;
	reference_id: string | null;
	custom_url: string | null;
	label: string;
	title_attr: string | null;
	target: string | null;
	css_classes: string | null;
}

/** URL of a page/post a menu item points to, from the collection's url pattern (e.g. /{slug}). */
function referenceUrl(collection: string | null, id: string | null): string | undefined {
	if (!collection || !id) return undefined;
	const def = getCollectionDef(collection);
	if (!def) return undefined;
	const row = get<{ slug: string | null; id: string }>(
		`SELECT id, slug FROM "ec_${def.slug}" WHERE (id = ? OR translation_group = ?) AND deleted_at IS NULL LIMIT 1`,
		id,
		id,
	);
	if (!row) return undefined;
	const slug = encodeURIComponent(row.slug || row.id);
	const pattern = def.urlPattern || `/${def.slug}/{slug}`;
	return pattern.replace("{slug}", slug).replace("{id}", row.id);
}

export function getMenu(name: string): Menu | null {
	const menu = get<{ id: string; name: string; label: string }>(`SELECT id, name, label FROM _emdash_menus WHERE name = ? ORDER BY id LIMIT 1`, name);
	if (!menu) return null;
	const rows = all<MenuItemRow>(`SELECT * FROM _emdash_menu_items WHERE menu_id = ? ORDER BY sort_order, created_at`, menu.id);
	const items = new Map<string, MenuItem>();
	for (const r of rows) {
		const url =
			r.type === "custom"
				? r.custom_url || "#"
				: r.type === "taxonomy"
					? r.custom_url || "#"
					: (referenceUrl(r.reference_collection, r.reference_id) ?? r.custom_url ?? "#");
		items.set(r.id, {
			id: r.id,
			label: r.label,
			url,
			target: r.target,
			titleAttr: r.title_attr,
			cssClasses: r.css_classes,
			type: r.type,
			children: [],
		});
	}
	const roots: MenuItem[] = [];
	for (const r of rows) {
		const item = items.get(r.id)!;
		const parent = r.parent_id ? items.get(r.parent_id) : undefined;
		if (parent) parent.children.push(item);
		else roots.push(item);
	}
	return { ...menu, items: roots };
}

export async function getMenuWithCacheHint(name: string): Promise<{ data: Menu | null; cacheHint: CacheHint }> {
	return { data: getMenu(name), cacheHint: { tags: [`menu:${name}`] } };
}

export interface MediaReference {
	mediaId: string;
	alt?: string;
	url?: string;
}

export interface SiteSettings {
	title?: string;
	tagline?: string;
	logo?: MediaReference;
	favicon?: MediaReference;
	[key: string]: unknown;
}

/** Site settings are the "site:*" rows of the options table (JSON values). */
export async function getSiteSettings(): Promise<SiteSettings> {
	const out: SiteSettings = {};
	for (const r of all<{ name: string; value: string }>(`SELECT name, value FROM options WHERE name LIKE 'site:%'`)) {
		try {
			out[r.name.slice(5)] = JSON.parse(r.value);
		} catch {
			out[r.name.slice(5)] = r.value;
		}
	}
	for (const key of ["logo", "favicon"] as const) {
		const ref = out[key] as MediaReference | undefined;
		if (ref?.mediaId && !ref.url) {
			const m = get<{ storage_key: string }>(`SELECT storage_key FROM media WHERE id = ?`, ref.mediaId);
			if (m) ref.url = `/_emdash/api/media/file/${m.storage_key}`;
		}
	}
	return out;
}

export async function getSiteSettingsWithCacheHint(): Promise<{ data: SiteSettings; cacheHint: CacheHint }> {
	return { data: await getSiteSettings(), cacheHint: { tags: ["settings"] } };
}

/** Plain text of Portable Text blocks (for search and descriptions). */
export function extractPlainText(blocks: unknown): string {
	if (!blocks) return "";
	if (typeof blocks === "string") return blocks;
	if (!Array.isArray(blocks)) return "";
	const parts: string[] = [];
	for (const b of blocks) {
		if (b && typeof b === "object" && Array.isArray((b as any).children)) {
			parts.push((b as any).children.map((c: any) => (typeof c?.text === "string" ? c.text : "")).join(""));
		}
	}
	return parts.filter(Boolean).join("\n");
}

/** URL slug param → stored slug (Thai slugs arrive percent-encoded). */
export function decodeSlug(raw: string | undefined): string | undefined {
	if (raw === undefined) return undefined;
	try {
		return decodeURIComponent(raw).normalize("NFC");
	} catch {
		return raw;
	}
}

export interface SeoMeta {
	title: string;
	ogTitle: string;
	description?: string;
	canonical?: string;
	ogImage?: string;
	robots?: string;
}

/** Title / description / canonical / share image for a content entry. */
export function getSeoMeta(
	entry: ContentEntry,
	options: { siteTitle?: string; siteUrl?: string; path?: string; defaultOgImage?: string } = {},
): SeoMeta {
	const d = entry.data as Record<string, any>;
	const title = String(d.seo?.title || d.title || "");
	const description = (d.seo?.description || d.excerpt || undefined) as string | undefined;
	const img = d.featured_image?.meta?.storageKey
		? `/_emdash/api/media/file/${d.featured_image.meta.storageKey}`
		: (d.featured_image?.src as string | undefined);
	const abs = (u?: string) => (u && options.siteUrl && u.startsWith("/") ? options.siteUrl + u : u);
	return {
		title: options.siteTitle ? `${title} | ${options.siteTitle}` : title,
		ogTitle: title,
		description,
		canonical: options.siteUrl && options.path !== undefined ? options.siteUrl + options.path : undefined,
		ogImage: abs(img ?? options.defaultOgImage),
	};
}
