import { siteLink } from "./site-link";
import { eventTypeName } from "./event-types";
import { adminDateTime, bangkokParts, thaiMonthsShort } from "./thai-date";

/**
 * Events as whole Bangkok days, shared by the homepage month calendar and the yearly calendar.
 * A "day number" is days since 1970-01-01 for a Bangkok calendar date, so ranges can be compared
 * and walked one day at a time.
 */
export type DayParts = { year: number; month: number; day: number };

export const dayNo = (p: DayParts) => Math.round(Date.UTC(p.year, p.month, p.day) / 86_400_000);

export const fromDayNo = (n: number): DayParts => {
	const d = new Date(n * 86_400_000);
	return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
};

export const weekdayOf = (n: number) => new Date(n * 86_400_000).getUTCDay();

/** "3 พ.ย. 69", "3–13 พ.ย. 69", "30 ต.ค. – 6 พ.ย. 69" */
export function rangeText(start: number, end: number) {
	const s = fromDayNo(start);
	const e = fromDayNo(end);
	const yy = (y: number) => String(y + 543).slice(-2);
	if (start === end) return `${s.day} ${thaiMonthsShort[s.month]} ${yy(s.year)}`;
	if (s.year === e.year && s.month === e.month) return `${s.day}–${e.day} ${thaiMonthsShort[s.month]} ${yy(s.year)}`;
	return `${s.day} ${thaiMonthsShort[s.month]}${s.year !== e.year ? ` ${yy(s.year)}` : ""} – ${e.day} ${thaiMonthsShort[e.month]} ${yy(e.year)}`;
}

type EventEntry = {
	data: {
		id: string;
		title: string;
		event_date: string;
		end_date?: string;
		description?: string;
		holiday?: boolean;
		link?: string;
		event_type?: string;
		type_name?: string;
	};
};

/** "วันที่" → "ถึงวันที่" (empty = one day) as day numbers, plus colour/link details for drawing. */
export function toCalEvent(entry: EventEntry, colorOf: (type?: string | null) => string) {
	const start = dayNo(bangkokParts(adminDateTime(entry.data.event_date)));
	const endRaw = entry.data.end_date ? dayNo(bangkokParts(adminDateTime(entry.data.end_date))) : start;
	const end = Math.max(start, endRaw);
	const link = siteLink(entry.data.link);
	return {
		id: entry.data.id,
		title: entry.data.title,
		description: entry.data.description,
		holiday: !!entry.data.holiday,
		type: eventTypeName(entry.data),
		color: colorOf(eventTypeName(entry.data)),
		link,
		external: /^https?:\/\//.test(link),
		start,
		end,
		range: rangeText(start, end),
	};
}

export type CalEvent = ReturnType<typeof toCalEvent>;

/**
 * Bars for one row of days [first, last]: each event clipped to the row, stacked into lanes so
 * overlapping events sit under each other. `from`/`to` are 1-based positions within the row.
 */
export function layoutBars(events: CalEvent[], first: number, last: number) {
	const pieces = events
		.filter((e) => !e.holiday && e.start <= last && e.end >= first)
		.map((e) => ({
			e,
			from: Math.max(e.start, first) - first + 1,
			to: Math.min(e.end, last) - first + 1,
			contLeft: e.start < first,
			contRight: e.end > last,
			lane: 0,
		}))
		.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));
	const laneEnds: number[] = [];
	for (const p of pieces) {
		let lane = laneEnds.findIndex((end) => end < p.from);
		if (lane < 0) lane = laneEnds.length;
		laneEnds[lane] = p.to;
		p.lane = lane;
	}
	return { pieces, lanes: laneEnds.length };
}
