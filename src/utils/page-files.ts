export const FILE_PAGE_TAXONOMY = "file_page";

/**
 * The "หน้าที่แสดงไฟล์" term for a page: same slug as the page, or the same name as its title,
 * so an editor can add a term for a new page just by typing the page's name.
 */
export function findFilePageTerm<T extends { slug: string; label: string }>(
	terms: T[],
	pageSlug: string,
	pageTitle: string,
) {
	const norm = (s: string) => s.trim().toLocaleLowerCase("th");
	return (
		terms.find((t) => t.slug === pageSlug || decodeURIComponent(t.slug) === pageSlug) ??
		terms.find((t) => norm(t.label) === norm(pageTitle))
	);
}

export interface PageTabLayout {
	/** Value typed in the file's "แท็บปี" field */
	key: string;
	/** Text on the tab */
	label: string;
	/** Optional status badge beside the label, e.g. "กำลังปรับปรุง" — remove it when the tab is done */
	status?: string;
	/** Group dropdowns shown in this order, even before they have files */
	groups: string[];
}

const REGIONAL_OFFICES = Array.from(
	{ length: 15 },
	(_, i) => `สำนักงานการตรวจเงินแผ่นดินภูมิภาคที่ ${i + 1} และจังหวัดในความรับผิดชอบ`,
);

/**
 * Pages whose files are split into year tabs with a fixed list of group dropdowns.
 * The tab bar shows even with one tab, so adding a year later is just one more entry.
 * A file with no "แท็บปี" goes in the first tab; a group not listed here is added after the listed ones.
 */
export const PAGE_TAB_LAYOUTS: Record<string, PageTabLayout[]> = {
	"job-descriptions": [
		{
			key: "2567",
			label: "2567",
			status: "กำลังปรับปรุง",
			groups: ["สำนักงานการตรวจเงินแผ่นดิน", "สำนักสนับสนุน", "สำนักตรวจสอบส่วนกลาง", ...REGIONAL_OFFICES],
		},
		// More years can be added here later, e.g. { key: "2561", label: "2561", groups: [...] },
	],
};
