/** Taxonomy terms (categories, tags, กลุ่มผู้ใช้ …), read from the taxonomies tables. */
import { all } from "./db";
import type { CacheHint } from "./content";

export interface TaxonomyTerm {
	id: string;
	name: string;
	slug: string;
	label: string;
	parentId?: string;
	description?: string;
	children: TaxonomyTerm[];
	count?: number;
	locale: string;
	translationGroup: string | null;
	sortOrder: number;
}

interface TermRow {
	id: string;
	name: string;
	slug: string;
	label: string;
	parent_id: string | null;
	data: string | null;
	locale: string;
	translation_group: string | null;
	sort_order: number;
}

const toTerm = (r: TermRow): TaxonomyTerm => {
	let description: string | undefined;
	try {
		description = r.data ? JSON.parse(r.data).description : undefined;
	} catch {
		/* ignore */
	}
	return {
		id: r.id,
		name: r.name,
		slug: r.slug,
		label: r.label,
		parentId: r.parent_id ?? undefined,
		description,
		children: [],
		locale: r.locale,
		translationGroup: r.translation_group,
		sortOrder: r.sort_order,
	};
};

/** All terms of a taxonomy as a tree (top-level terms, each with its children), in admin order. */
export function getTaxonomyTerms(name: string): TaxonomyTerm[] {
	const rows = all<TermRow>(`SELECT * FROM taxonomies WHERE name = ? ORDER BY sort_order ASC, label ASC`, name);
	const nodes = rows.map(toTerm);
	const byGroup = new Map(nodes.map((n) => [n.translationGroup ?? n.id, n]));
	const roots: TaxonomyTerm[] = [];
	for (const n of nodes) {
		const parent = n.parentId ? byGroup.get(n.parentId) : undefined;
		if (parent && parent !== n) parent.children.push(n);
		else roots.push(n);
	}
	return roots;
}

export async function getTaxonomyTermsWithCacheHint(name: string): Promise<{ data: TaxonomyTerm[]; cacheHint: CacheHint }> {
	return { data: getTaxonomyTerms(name), cacheHint: { tags: [`taxonomy:${name}`] } };
}

/** Terms of one taxonomy for many entries at once (entry database id → its terms). */
export async function getTermsForEntries(
	collection: string,
	entryIds: string[],
	taxonomyName: string,
): Promise<Map<string, TaxonomyTerm[]>> {
	const ids = [...new Set(entryIds)];
	const result = new Map<string, TaxonomyTerm[]>(ids.map((id) => [id, []]));
	if (!ids.length) return result;
	for (let i = 0; i < ids.length; i += 500) {
		const chunk = ids.slice(i, i + 500);
		const rows = all<TermRow & { entry_id: string }>(
			`SELECT ct.entry_id, t.* FROM content_taxonomies ct JOIN taxonomies t ON t.id = ct.taxonomy_id
			 WHERE ct.collection = ? AND t.name = ? AND ct.entry_id IN (${chunk.map(() => "?").join(",")})
			 ORDER BY t.sort_order, t.label`,
			collection,
			taxonomyName,
			...chunk,
		);
		for (const r of rows) result.get(r.entry_id)?.push(toTerm(r));
	}
	return result;
}

export async function getEntryTerms(collection: string, entryId: string, taxonomyName: string) {
	return (await getTermsForEntries(collection, [entryId], taxonomyName)).get(entryId) ?? [];
}
