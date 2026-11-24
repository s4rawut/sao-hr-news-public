import { getEmDashCollection } from "emdash";

/**
 * Homepage/footer settings, edited in admin under "ข้อมูลเว็บไซต์ / หน้าแรก".
 * The entry with slug "main" wins; otherwise the first published entry.
 * Every value falls back to a default so the site still renders if the entry is deleted.
 */

const defaults = {
	site_name: "",
	logo_shape: "วงกลม",
	hero_title: "",
	hero_subtitle: "",
	org_name_en: "Human Resource Management Office",
	heading_performance: "ผลการดำเนินการเดือน",
	heading_performance_tab: "ผลการดำเนินการของ สบท.",
	heading_recruitments: "ประกาศคณะกรรมการคัดเลือกฯ",
	heading_news: "ข่าวประชาสัมพันธ์",
	heading_documents: "คลังข้อมูล",
	heading_calendar: "ปฏิทินกิจกรรม",
	news_limit: 9,
	documents_limit: 8,
	new_badge_days: 14,
	footer_text: "",
	status_badge: "",
	show_visitor_counter: true,
	// "เปิดใช้ปฏิทินรายปี": off = monthly calendar only, no ดูทั้งหมด link and /calendar is 404
	show_year_calendar: false,
	// homepage popups: the occasion banner (admin → ป๊อปอัพแบนเนอร์หน้าแรก) and "มีอะไรใหม่"
	show_entry_banners: false,
	show_welcome_popup: true,
	// "มีอะไรใหม่" popup texts; welcome_items = one "หัวข้อ | คำอธิบาย" per line
	welcome_title: "ยินดีต้อนรับสู่เว็บไซต์ใหม่ สบท.",
	welcome_lead: "มีอะไรใหม่ในเว็บไซต์ สบท.",
	welcome_items: "ระบบค้นหา | ค้นหาได้ทุกเรื่องในที่เดียว ทั้งเอกสาร แบบฟอร์ม โครงสร้าง หน่วยรับตรวจ และรายชื่อบุคลากร สบท.\nปฏิทินกิจกรรม | ดูกำหนดการและกิจกรรมของ สบท. ได้สะดวกยิ่งขึ้น\nข่าวประชาสัมพันธ์ | ข่าวสำคัญที่แสดงให้เห็นไว้ในหน้าแรกสุด\nคลังข้อมูล | ประกาศ คำสั่ง ระเบียบ หลักเกณฑ์ บันทึกข้อความ เลือกดูตามหมวดหมู่ ได้สะดวกยิ่งขึ้น\nประกาศคณะกรรมการคัดเลือกฯ | ตรวจสอบสถานะการรับสมัครและการคัดเลือกได้ในแต่ละระดับตำแหน่งว่าอยู่ในขั้นตอนใด",
	// footer status badge colour (เหลือง / เขียว / แดง / น้ำเงิน / ส้ม / ม่วง / เทา)
	status_badge_color: "เหลือง",
	calendar_note: "กำหนดการข้างต้นอาจเปลี่ยนแปลงตามความเหมาะสมและความจำเป็น",
	contact_heading: "ติดต่อสำนักงาน",
	address: "",
	phone: "",
	email: "",
	line_id: "",
	line_url: "",
};

export async function getSiteInfo() {
	const { entries, cacheHint } = await getEmDashCollection("site_info", { limit: 10 });
	const entry = entries.find((e) => e.id === "main") ?? entries[0];
	const data = entry?.data ?? {};

	const merged = { ...defaults };
	for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
		const value = data[key as keyof typeof data];
		if (value !== undefined && value !== null && value !== "") {
			(merged as Record<string, unknown>)[key] = value;
		}
	}

	return {
		...merged,
		hero_image: data.hero_image,
		logo: data.logo,
		entry,
		cacheHint,
	};
}

/** Maps the Thai "ไอคอน" select options in admin to Icon.astro names. */
export const quickLinkIcons: Record<string, string> = {
	เอกสาร: "office",
	คอมพิวเตอร์: "monitor",
	ปฏิทิน: "calendar",
	อีเมล: "mail",
	อินเทอร์เน็ต: "globe",
	อาคาร: "building",
	ผู้ใช้: "user",
	ลิงก์: "link",
};

/** Public URL for an image field value from the Media Library (or an external URL). */
export function mediaUrl(
	media: { src?: string; url?: string; meta?: Record<string, unknown> } | undefined | null,
) {
	const key = media?.meta?.storageKey;
	if (typeof key === "string") return `/_emdash/api/media/file/${key}`;
	return media?.src || media?.url || undefined;
}
