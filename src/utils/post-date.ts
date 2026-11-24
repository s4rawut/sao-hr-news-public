import { adminDateTime } from "./thai-date";

/**
 * The date of a คลังข้อมูล post or a "ไฟล์เอกสารในหน้าเว็บ" file: only the "วันที่" typed in admin.
 * The publish time is never shown — an item without a typed date shows no date, gets no "ใหม่"
 * badge, and sorts after the dated ones.
 */
export function postDate(post: { data: { doc_date?: string | null } }) {
	return post.data.doc_date ? adminDateTime(post.data.doc_date) : undefined;
}

/** Newest typed date first; items without a date after them (newest published first among those). */
export function byPostDate<T extends { data: { doc_date?: string | null; publishedAt?: Date | null } }>(posts: T[]) {
	return [...posts].sort((a, b) => {
		const da = postDate(a)?.getTime();
		const db = postDate(b)?.getTime();
		if (da !== undefined && db !== undefined && da !== db) return db - da;
		if (da === undefined && db !== undefined) return 1;
		if (db === undefined && da !== undefined) return -1;
		return (b.data.publishedAt?.getTime() ?? 0) - (a.data.publishedAt?.getTime() ?? 0);
	});
}

/**
 * The "ใหม่" badge on a post or a file: shown when "แสดงป้าย ใหม่" is ticked on it, or when its
 * typed date is within the last `days` days ("แสดงป้าย ใหม่ อัตโนมัติกี่วัน" in ข้อมูลเว็บไซต์, 0 = off).
 */
export function showNewBadge(
	entry: { data: { show_new?: boolean | number | null; doc_date?: string | null } },
	days: number,
	now = Date.now(),
) {
	if (entry.data.show_new) return true;
	const d = postDate(entry);
	return !!d && days > 0 && now - d.getTime() < days * 86_400_000;
}
