/** Sidebar groups of the admin and friendlier names for a few collections. */
import { listCollectionDefs, type CollectionDef } from "../lib/cms/schema";

export const LABEL_OVERRIDES: Record<string, string> = {
	posts: "คลังข้อมูล",
	pages: "หน้าเว็บ",
};

export const collectionLabel = (c: Pick<CollectionDef, "slug" | "label">) => LABEL_OVERRIDES[c.slug] ?? c.label;

const GROUPS: { label: string; slugs: string[] }[] = [
	{ label: "หน้าแรกและข่าว", slugs: ["site_info", "posts", "recruitments", "recruit_statuses", "events", "event_types", "performance", "quick_links", "entry_banners"] },
	{ label: "หน้าเว็บและเอกสาร", slugs: ["pages", "forms", "infographics"] },
	{ label: "เกี่ยวกับเรา / โครงสร้าง", slugs: ["about_tabs", "structure_tabs", "directors", "executives", "org_units", "staff_groups", "seat_plans", "sao_offices"] },
	{ label: "หน่วยรับตรวจ", slugs: ["audit_orders", "audit_offices"] },
];

export function navGroups() {
	const defs = listCollectionDefs().filter((c) => !c.hidden);
	const used = new Set<string>();
	const groups = GROUPS.map((g) => ({
		label: g.label,
		items: g.slugs
			.map((s) => defs.find((d) => d.slug === s))
			.filter((d): d is CollectionDef => !!d)
			.map((d) => {
				used.add(d.slug);
				return { slug: d.slug, label: collectionLabel(d) };
			}),
	})).filter((g) => g.items.length);
	const rest = defs.filter((d) => !used.has(d.slug));
	if (rest.length) groups.push({ label: "อื่น ๆ", items: rest.map((d) => ({ slug: d.slug, label: collectionLabel(d) })) });
	return groups;
}

/** Collections with exactly one entry meant to exist (site settings style). */
export const SINGLETONS = new Set(["site_info"]);
