export const TIME_ZONE = "Asia/Bangkok";

export const thaiMonths = [
	"มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
	"กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export const thaiMonthsShort = [
	"ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
	"ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export const thaiWeekdays = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export const thaiWeekdaysShort = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/**
 * The admin's date-time picker saves the typed wall-clock time with a "Z" (UTC) suffix,
 * so "13/11/2026 20:37" is stored as 2026-11-13T20:37Z. Shift it so it reads back as
 * that same date and time in Bangkok instead of rolling over into the next day.
 */
export function adminDateTime(value: unknown) {
	return new Date(new Date(value as string).getTime() - 7 * 3_600_000);
}

/** Calendar parts of a date as seen in Bangkok. `month` is 0-based. */
export function bangkokParts(date: Date) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "numeric",
		day: "numeric",
		weekday: "short",
	}).formatToParts(date);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return {
		year: Number(get("year")),
		month: Number(get("month")) - 1,
		day: Number(get("day")),
		weekday: weekdays.indexOf(get("weekday")),
	};
}

/** "27 ต.ค. 2569" */
export function formatThaiShort(date: Date) {
	const { year, month, day } = bangkokParts(date);
	return `${day} ${thaiMonthsShort[month]} ${year + 543}`;
}

/** "วันพฤหัสบดีที่ 29 ตุลาคม 2569" */
export function formatThaiLong(date: Date) {
	const { year, month, day, weekday } = bangkokParts(date);
	return `วัน${thaiWeekdays[weekday]}ที่ ${day} ${thaiMonths[month]} ${year + 543}`;
}

/** "3 ชั่วโมงที่แล้ว" within a day, otherwise "04 พ.ย. 69" */
export function formatThaiAgo(date: Date, now = new Date()) {
	const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
	if (minutes >= 0 && minutes < 60) return minutes < 1 ? "เมื่อสักครู่" : `${minutes} นาทีที่แล้ว`;
	if (minutes >= 0 && minutes < 24 * 60) return `${Math.floor(minutes / 60)} ชั่วโมงที่แล้ว`;
	const { year, month, day } = bangkokParts(date);
	return `${String(day).padStart(2, "0")} ${thaiMonthsShort[month]} ${String(year + 543).slice(-2)}`;
}

/** "5 ตุลาคม 2569" */
export function formatThaiDate(date: Date) {
	const { year, month, day } = bangkokParts(date);
	return `${day} ${thaiMonths[month]} ${year + 543}`;
}

/** Length of service counting both the first and last day: "2 ปี 11 เดือน 23 วัน" */
export function formatThaiDuration(start: Date, end: Date) {
	const s = bangkokParts(start);
	const e = bangkokParts(end);
	const endExclusive = Date.UTC(e.year, e.month, e.day + 1);
	let months = (e.year - s.year) * 12 + (e.month - s.month);
	if (Date.UTC(s.year, s.month + months, s.day) > endExclusive) months--;
	if (months < 0) return "";
	const days = Math.round((endExclusive - Date.UTC(s.year, s.month + months, s.day)) / 86_400_000);
	return `${Math.floor(months / 12)} ปี ${months % 12} เดือน ${days} วัน`;
}

/** "จ. 16 พ.ย. 69" */
export function formatThaiCompact(date: Date) {
	const { year, month, day, weekday } = bangkokParts(date);
	return `${thaiWeekdaysShort[weekday]}. ${day} ${thaiMonthsShort[month]} ${String(year + 543).slice(-2)}`;
}
