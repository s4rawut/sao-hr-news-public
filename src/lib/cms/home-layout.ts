/** Homepage arrangement, stored in the options table ("hr:home_layout"). */
import { get, run, touch } from "./db";

export type HomeWidth = "full" | "left" | "right";
export interface HomeSection {
	key: string;
	visible: boolean;
	width: HomeWidth;
}

/** Every section the homepage can show, with its admin name and default place. */
export const HOME_SECTIONS: { key: string; label: string; help: string; width: HomeWidth }[] = [
	{ key: "quick_links", label: "ลิงก์ระบบงาน (DPIS 6 / สวัสดิการ / เว็บไซต์ สตง.)", help: "แก้รายการได้ที่ ลิงก์ระบบงาน", width: "full" },
	{ key: "recruit", label: "ข่าวรับสมัครสอบ", help: "ประกาศรับสมัครสอบ แยกตามประเภท/ระดับ", width: "full" },
	{ key: "news", label: "ข่าวประชาสัมพันธ์", help: "เรื่องที่ปักหมุด + ผลการดำเนินการประจำเดือน", width: "left" },
	{ key: "calendar", label: "ปฏิทินกิจกรรม", help: "ปฏิทินรายเดือน", width: "right" },
	{ key: "documents", label: "คลังข้อมูล", help: "ประกาศ / คำสั่ง / ระเบียบ … พร้อมปุ่มหมวด", width: "full" },
];

const defaults = (): HomeSection[] => HOME_SECTIONS.map((s) => ({ key: s.key, visible: true, width: s.width }));

export function getHomeLayout(): HomeSection[] {
	const row = get<{ value: string }>(`SELECT value FROM options WHERE name = 'hr:home_layout'`);
	let saved: HomeSection[] = [];
	try {
		saved = row ? (JSON.parse(row.value) as HomeSection[]) : [];
	} catch {
		saved = [];
	}
	const known = new Set(HOME_SECTIONS.map((s) => s.key));
	const out = saved
		.filter((s) => known.has(s.key))
		.map((s) => ({ key: s.key, visible: s.visible !== false, width: (["full", "left", "right"].includes(s.width) ? s.width : "full") as HomeWidth }));
	// sections added in a later version appear at their default place
	for (const d of defaults()) if (!out.some((s) => s.key === d.key)) out.push(d);
	return out.length ? out : defaults();
}

export function saveHomeLayout(layout: HomeSection[]) {
	const known = new Set(HOME_SECTIONS.map((s) => s.key));
	const clean = layout
		.filter((s) => known.has(s.key))
		.map((s) => ({ key: s.key, visible: !!s.visible, width: ["full", "left", "right"].includes(s.width) ? s.width : "full" }));
	run(
		`INSERT INTO options (name, value) VALUES ('hr:home_layout', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
		JSON.stringify(clean),
	);
	touch();
}
