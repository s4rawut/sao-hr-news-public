import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AstroCookies } from "astro";
import { bangkokParts } from "./thai-date";

/**
 * Minimal visitor counter: one visit per browser per day (tracked by cookie),
 * persisted to a JSON file next to the database.
 */

const FILE = resolve("./data/visits.json");
const COOKIE = "hr_visit_day";

interface VisitStore {
	total: number;
	days: Record<string, number>;
}

function load(): VisitStore {
	try {
		return JSON.parse(readFileSync(FILE, "utf8")) as VisitStore;
	} catch {
		return { total: 0, days: {} };
	}
}

export function countVisit(cookies: AstroCookies) {
	const { year, month, day } = bangkokParts(new Date());
	const today = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	const monthKey = today.slice(0, 7);
	const store = load();

	if (cookies.get(COOKIE)?.value !== today) {
		store.total += 1;
		store.days[today] = (store.days[today] ?? 0) + 1;
		try {
			mkdirSync(dirname(FILE), { recursive: true });
			writeFileSync(FILE, JSON.stringify(store));
		} catch {
			// Read-only filesystem: show counts without recording.
		}
	}

	const thisMonth = Object.entries(store.days)
		.filter(([key]) => key.startsWith(monthKey))
		.reduce((sum, [, n]) => sum + n, 0);

	// The layout streams, so the server can no longer set cookies here; the page sets this one in the
	// browser (see Base.astro) so the same visitor is counted once a day.
	return { today: store.days[today] ?? 0, month: thisMonth, total: store.total, cookie: `${COOKIE}=${today}` };
}
