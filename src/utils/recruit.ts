import { byPostDate, postDate } from "./post-date";
import { getEmDashCollection, getEmDashReferences, getTaxonomyTermsWithCacheHint, getTermsForEntries } from "../lib/cms";
import { adminDateTime, bangkokParts, thaiMonthsShort } from "./thai-date";

/**
 * Recruitment announcements grouped by position type → level
 * (taxonomy "ประเภท / ระดับตำแหน่ง": บริหาร › ระดับต้น, วิชาการ › ระดับชำนาญการ …).
 */
export const RECRUIT_TAXONOMY = "recruit_level";

/** Badge colours offered in "สถานะประกาศรับสมัคร"; a custom hex code overrides them. */
const STATUS_COLORS: Record<string, string> = {
	เขียว: "#13804a",
	เทา: "#5f7480",
	ฟ้า: "#1d63c4",
	ม่วง: "#6a3fbf",
	น้ำตาลทอง: "#a35f00",
	ส้ม: "#c25a00",
	แดง: "#c62828",
	ชมพู: "#c2185b",
	เขียวอมฟ้า: "#0f6f87",
};
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export interface RecruitStage {
	label: string;
	color: string;
	/** "ลำดับในรายการ" of the status — เปิดรับสมัคร comes first */
	order: number;
	/** Date or period shown on the card, e.g. "4–10 พ.ย. 69" */
	period?: string;
	/** Word in front of the period: "รับสมัคร" for the automatic statuses, otherwise the status name
	 * (e.g. "เรียกรายงานตัว 4 ธ.ค. 69") */
	periodLabel?: string;
}

// Calendar day in Bangkok as a sortable number, e.g. 20261104.
const dayKey = (d: Date) => {
	const { year, month, day } = bangkokParts(d);
	return year * 10000 + (month + 1) * 100 + day;
};
const toDate = (v: unknown) => (v ? adminDateTime(v instanceof Date ? v.toISOString() : v) : undefined);

/** "4–10 พ.ย. 69", "30 ต.ค. – 6 พ.ย. 69", or one end only */
function formatPeriod(start?: Date, end?: Date) {
	const p = (d: Date) => bangkokParts(d);
	const yy = (y: number) => String((y + 543) % 100).padStart(2, "0");
	if (start && end) {
		const a = p(start);
		const b = p(end);
		if (a.year === b.year && a.month === b.month && a.day === b.day) return `${a.day} ${thaiMonthsShort[a.month]} ${yy(a.year)}`;
		if (a.year === b.year && a.month === b.month) return `${a.day}–${b.day} ${thaiMonthsShort[b.month]} ${yy(b.year)}`;
		if (a.year === b.year) return `${a.day} ${thaiMonthsShort[a.month]} – ${b.day} ${thaiMonthsShort[b.month]} ${yy(b.year)}`;
		return `${a.day} ${thaiMonthsShort[a.month]} ${yy(a.year)} – ${b.day} ${thaiMonthsShort[b.month]} ${yy(b.year)}`;
	}
	const d = start ?? end;
	if (!d) return undefined;
	const x = p(d);
	return `${start ? "ตั้งแต่" : "ถึง"} ${x.day} ${thaiMonthsShort[x.month]} ${yy(x.year)}`;
}

export async function getRecruitData() {
	const [termsResult, recruitResult] = await Promise.all([
		getTaxonomyTermsWithCacheHint(RECRUIT_TAXONOMY),
		getEmDashCollection("recruitments", { orderBy: { published_at: "desc" }, limit: 500 }),
	]);
	// ลำดับการแสดง first, then the typed "วันที่ประกาศ" (newest first; undated after)
	const dateOrder = byPostDate(recruitResult.entries).map((e) => e.data.id);
	const entries = [...recruitResult.entries].sort(
		(a, b) =>
			(a.data.sort_order ?? Infinity) - (b.data.sort_order ?? Infinity) ||
			dateOrder.indexOf(a.data.id) - dateOrder.indexOf(b.data.id),
	);
	const termsByEntry = await getTermsForEntries(
		"recruitments",
		entries.map((e) => e.data.id),
		RECRUIT_TAXONOMY,
	);
	// Each announcement's stage is a reference to an entry in "สถานะประกาศรับสมัคร".
	const stages = new Map<string, RecruitStage>();
	// announcements whose picked status is not one of the two automatic ones (open / closed)
	const pickedFixed = new Set<string>();
	await Promise.all(
		entries.map(async (e) => {
			const ref = await getEmDashReferences<{ title: string; color?: string; custom_color?: string; sort_order?: number | null }>(
				"recruitments",
				e.data.id,
				"stage",
				{ limit: 1 },
			);
			const stage = ref.entries[0]?.data;
			if (!stage) return;
			const slug = ref.entries[0]?.id;
			const fixed = slug !== "open" && slug !== "closed";
			if (fixed) pickedFixed.add(e.data.id);
			const custom = stage.custom_color?.trim() ?? "";
			// a picked status like เรียกรายงานตัว / ประกาศรายชื่อ… shows its own date: the start/end
			// date fields if filled (e.g. the reporting day), otherwise the "วันที่ประกาศ"
			const start = toDate(e.data.apply_start);
			const end = toDate(e.data.apply_end);
			const announced = postDate(e);
			const period = fixed ? (start || end ? formatPeriod(start ?? end, end ?? start) : announced ? formatPeriod(announced, announced) : undefined) : undefined;
			stages.set(e.data.id, {
				label: stage.title,
				order: stage.sort_order ?? 999,
				color: HEX.test(custom) ? custom : (STATUS_COLORS[stage.color ?? ""] ?? STATUS_COLORS["เทา"]),
				period,
				periodLabel: period ? stage.title.trim() : undefined,
			});
		}),
	);
	// A status picked in "สถานะ" (e.g. เรียกรายงานตัว) always wins. Only when none is picked — or the
	// picked one is เปิด/ปิดรับสมัคร — does an application period set the status from the calendar:
	// open until the last day, then closed.
	const statusColor = async () => {
		const res = await getEmDashCollection("recruit_statuses", { limit: 50 });
		// The two automatic statuses are the entries with slug "open" and "closed", so their name
		// and colour can be edited freely in "สถานะประกาศรับสมัคร".
		const find = (slug: string, title: string) =>
			(res.entries.find((s) => s.id === slug) ?? res.entries.find((s) => s.data.title?.trim() === title))?.data;
		const color = (s?: { color?: string; custom_color?: string }, fallback = STATUS_COLORS["เทา"]) =>
			HEX.test(s?.custom_color?.trim() ?? "") ? s!.custom_color!.trim() : (STATUS_COLORS[s?.color ?? ""] ?? fallback);
		const open = find("open", "เปิดรับสมัคร");
		const closed = find("closed", "ปิดรับสมัคร");
		return {
			open: color(open, STATUS_COLORS["เขียว"]),
			closed: color(closed),
			openLabel: open?.title?.trim() || "เปิดรับสมัคร",
			closedLabel: closed?.title?.trim() || "ปิดรับสมัคร",
		};
	};
	const today = dayKey(new Date());
	const dated = entries.filter((e) => (e.data.apply_start || e.data.apply_end) && !pickedFixed.has(e.data.id));
	if (dated.length > 0) {
		const colors = await statusColor();
		for (const e of dated) {
			const start = toDate(e.data.apply_start);
			const end = toDate(e.data.apply_end);
			const open = end ? today <= dayKey(end) : true;
			stages.set(e.data.id, {
				label: open ? colors.openLabel : colors.closedLabel,
				color: open ? colors.open : colors.closed,
				order: open ? 1 : 2,
				period: formatPeriod(start, end),
				periodLabel: "รับสมัคร",
			});
		}
	}
	const stageOf = (entryId: string) => stages.get(entryId);

	const inLevel = (slug: string) => entries.filter((e) => (termsByEntry.get(e.data.id) ?? []).some((t) => t.slug === slug));

	// Top-level terms are position types; their children are the levels people click into.
	const types = termsResult.data.map((type) => ({
		slug: type.slug,
		label: type.label,
		levels: (type.children ?? []).map((level) => ({
			slug: level.slug,
			label: level.label,
			description: level.description,
			typeSlug: type.slug,
			typeLabel: type.label,
			entries: inLevel(level.slug),
		})),
	}));
	const levels = types.flatMap((t) => t.levels);
	const levelOf = (entryId: string) => {
		const slugs = (termsByEntry.get(entryId) ?? []).map((t) => t.slug);
		return levels.find((l) => slugs.includes(l.slug));
	};

	return {
		types,
		levels,
		entries,
		levelOf,
		stageOf,
		cacheHints: [termsResult.cacheHint, recruitResult.cacheHint],
	};
}

/** Page for one announcement's level, or the overview when it has none */
export const recruitHref = (entrySlug: string, levelSlug?: string) =>
	`/recruitments${levelSlug ? `/${encodeURIComponent(levelSlug)}` : ""}#recruit-${encodeURIComponent(entrySlug)}`;
