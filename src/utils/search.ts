import { postDate } from "./post-date";
import { extractPlainText, getEmDashCollection, getTermsForEntries } from "../lib/cms";
import { formFileType, formHref } from "./forms";
import { getRecruitData, recruitHref } from "./recruit";
import { FILE_PAGE_TAXONOMY, findFilePageTerm } from "./page-files";
import { mediaUrl } from "./site-info";
import { adminDateTime, bangkokParts, formatThaiShort } from "./thai-date";
import { formatThaiMonth } from "./video";

/**
 * Site-wide search across every public collection.
 * Uses plain substring matching (case-insensitive) because Thai text has no
 * word spaces, which word-based full-text indexes handle poorly.
 */

export interface SearchHit {
	type: string;
	typeLabel: string;
	title: string;
	snippet: string;
	url: string;
	date?: string;
	image?: string;
	external?: boolean;
}

const SNIPPET_RADIUS = 60;

function normalize(text: string) {
	return text.toLocaleLowerCase("th").replace(/\s+/g, " ").trim();
}

function snippetAround(text: string, query: string) {
	const clean = text.replace(/\s+/g, " ").trim();
	const at = normalize(clean).indexOf(query);
	if (at < 0) return clean.slice(0, SNIPPET_RADIUS * 2) + (clean.length > SNIPPET_RADIUS * 2 ? "…" : "");
	const start = Math.max(0, at - SNIPPET_RADIUS);
	const end = Math.min(clean.length, at + query.length + SNIPPET_RADIUS);
	return (start > 0 ? "…" : "") + clean.slice(start, end) + (end < clean.length ? "…" : "");
}

interface Candidate {
	hit: Omit<SearchHit, "snippet">;
	/** Text the title is matched against (ranked higher) */
	title: string;
	/** Remaining searchable text */
	body: string;
	/** Names that, typed exactly (e.g. an office's abbreviation), put this result first */
	exact?: string[];
	sortDate?: number;
}

async function collectCandidates(): Promise<Candidate[]> {
	const [posts, pages, recruitData, events, quickLinks, forms, performance, infographics, directors, seatPlans, staffGroups, auditOrders, auditOffices, offices, structureTabs, executives, orgUnits] = await Promise.all([
		getEmDashCollection("posts", { limit: 1000, orderBy: { published_at: "desc" } }),
		getEmDashCollection("pages", { limit: 500 }),
		getRecruitData(),
		getEmDashCollection("events", { limit: 1000 }),
		getEmDashCollection("quick_links", { limit: 100 }),
		getEmDashCollection("forms", { limit: 1000, orderBy: { published_at: "desc" } }),
		getEmDashCollection("performance", { limit: 500 }),
		getEmDashCollection("infographics", { limit: 1000 }),
		getEmDashCollection("directors", { limit: 200 }),
		getEmDashCollection("seat_plans", { limit: 200 }),
		getEmDashCollection("staff_groups", { limit: 200 }),
		getEmDashCollection("audit_orders", { limit: 200 }),
		getEmDashCollection("audit_offices", { limit: 200 }),
		getEmDashCollection("sao_offices", { limit: 1000 }),
		getEmDashCollection("structure_tabs", { limit: 50 }),
		getEmDashCollection("executives", { limit: 50 }),
		getEmDashCollection("org_units", { limit: 200 }),
	]);
	// Each file links to the bar on the first page it is ticked for.
	const filePages = await getTermsForEntries(
		"infographics",
		infographics.entries.map((g) => g.data.id),
		FILE_PAGE_TAXONOMY,
	);
	const pageForFile = (id: string) => {
		for (const term of filePages.get(id) ?? []) {
			const page = pages.entries.find((p) => findFilePageTerm([term], p.id, p.data.title));
			if (page) return page;
		}
		return undefined;
	};

	const out: Candidate[] = [];

	for (const p of posts.entries) {
		out.push({
			title: p.data.title,
			body: `${p.data.excerpt ?? ""} ${extractPlainText(p.data.content)}`,
			sortDate: postDate(p)?.getTime(),
			hit: {
				type: "post",
				typeLabel: "คลังข้อมูล",
				title: p.data.title,
				url: `/posts/${encodeURIComponent(p.id)}`,
				date: postDate(p) ? formatThaiShort(postDate(p)!) : undefined,
			},
		});
	}

	for (const p of pages.entries) {
		out.push({
			title: p.data.title,
			body: extractPlainText(p.data.content),
			hit: { type: "page", typeLabel: "หน้าเว็บ", title: p.data.title, url: `/${encodeURIComponent(p.id)}` },
		});
	}

	for (const r of recruitData.entries) {
		const level = recruitData.levelOf(r.data.id);
		const stage = recruitData.stageOf(r.data.id)?.label;
		out.push({
			title: r.data.title,
			body: `${r.data.banner?.alt ?? ""} ${r.data.description ?? ""} ${stage ?? ""} ${
				level ? `${level.typeLabel} ${level.label}` : ""
			} ประกาศรับสมัครสอบ`,
			sortDate: postDate(r)?.getTime(),
			hit: {
				type: "recruitment",
				typeLabel: stage ? `ประกาศรับสมัครสอบ · ${stage}` : "ประกาศรับสมัครสอบ",
				title: r.data.title,
				url: recruitHref(r.id, level?.slug),
				date: postDate(r) ? formatThaiShort(postDate(r)!) : undefined,
			},
		});
	}

	for (const e of events.entries) {
		const date = adminDateTime(e.data.event_date);
		const { year, month } = bangkokParts(date);
		out.push({
			title: e.data.title,
			body: `${e.data.description ?? ""} ปฏิทินกิจกรรม`,
			sortDate: date.getTime(),
			hit: {
				type: "event",
				typeLabel: "ปฏิทินกิจกรรม",
				title: e.data.title,
				url: `/?m=${year}-${String(month + 1).padStart(2, "0")}#calendar`,
				date: formatThaiShort(date),
			},
		});
	}

	for (const q of quickLinks.entries) {
		out.push({
			title: q.data.title,
			body: `${q.data.url} ระบบงาน`,
			hit: {
				type: "link",
				typeLabel: "ระบบงาน",
				title: q.data.title,
				url: q.data.url,
				external: /^https?:/.test(q.data.url),
			},
		});
	}

	for (const f of forms.entries) {
		const href = formHref(f.data);
		const type = formFileType(f.data);
		out.push({
			title: f.data.title,
			body: `${f.data.description ?? ""} แบบฟอร์ม ${f.data.file?.filename ?? ""}`,
			sortDate: postDate(f)?.getTime(),
			hit: {
				type: "form",
				typeLabel: type ? `แบบฟอร์ม · ${type}` : "แบบฟอร์ม",
				title: f.data.title,
				url: href ?? "/forms",
				date: postDate(f) ? formatThaiShort(postDate(f)!) : undefined,
				external: !!href,
			},
		});
	}

	for (const v of performance.entries) {
		const date = new Date(v.data.report_month as unknown as string);
		const month = formatThaiMonth(date);
		out.push({
			title: v.data.title,
			body: `${v.data.description ?? ""} ผลการดำเนินการ วิดีโอ ${month}`,
			sortDate: date.getTime(),
			hit: {
				type: "video",
				typeLabel: "วิดีโอผลการดำเนินการ",
				title: v.data.title,
				url: `/performance/${encodeURIComponent(v.id)}`,
				date: month,
			},
		});
	}

	for (const g of infographics.entries) {
		const page = pageForFile(g.data.id);
		const base = page ? `/${encodeURIComponent(page.id)}` : undefined;
		const href = base ? `${base}#info-${encodeURIComponent(g.id)}` : mediaUrl(g.data.file);
		out.push({
			title: g.data.title,
			body: `${g.data.description ?? ""} อินโฟกราฟิก ${g.data.file?.filename ?? ""}`,
			sortDate: postDate(g)?.getTime(),
			hit: {
				type: "infographic",
				typeLabel: page ? page.data.title : "ไฟล์เอกสาร",
				title: g.data.title,
				url: href ?? "/",
				date: postDate(g) ? formatThaiShort(postDate(g)!) : undefined,
				external: !base,
			},
		});
	}

	// Directors and office groups live in the tabs of the page that has "แสดงแท็บเกี่ยวกับเรา" ticked.
	const aboutPage = pages.entries.find((p) => p.data.show_about_tabs);
	const aboutUrl = aboutPage ? `/${encodeURIComponent(aboutPage.id)}` : "/";
	const aboutLabel = aboutPage?.data.title ?? "เกี่ยวกับเรา";

	for (const d of directors.entries) {
		out.push({
			title: d.data.title,
			body: `${d.data.position || "ผู้อำนวยการสำนักบริหารทรัพยากรบุคคล"} ${d.data.term ?? ""} ทำเนียบผู้อำนวยการ`,
			hit: {
				type: "director",
				typeLabel: `${aboutLabel} · ทำเนียบผู้อำนวยการ`,
				title: d.data.title,
				url: `${aboutUrl}#director-${encodeURIComponent(d.id)}`,
				image: mediaUrl(d.data.photo),
			},
		});
	}

	for (const g of seatPlans.entries) {
		out.push({
			title: g.data.title,
			body: `${g.data.phone ?? ""} ${g.data.phone_list ?? ""} ${(g.data.seat_boxes ?? [])
				.map((b) => `${b.label ?? ""} ${b.phone ?? ""}`)
				.join(" ")} ผังที่นั่ง เบอร์โทร`,
			hit: {
				type: "group",
				typeLabel: `${aboutLabel} · ผังที่นั่งและเบอร์โทร`,
				title: g.data.title,
				url: `${aboutUrl}#seat-${encodeURIComponent(g.id)}`,
			},
		});
	}

	for (const g of staffGroups.entries) {
		for (const m of g.data.staff_members ?? []) {
			out.push({
				title: m.name,
				body: `${m.position ?? ""} ${m.phone ?? ""} ${g.data.title} บุคลากร`,
				hit: {
					type: "staff",
					typeLabel: `${aboutLabel} · ${g.data.title}`,
					title: m.name,
					url: `${aboutUrl}#staff-${encodeURIComponent(g.id)}`,
					image: mediaUrl(m.photo),
				},
			});
		}
	}

	// Structure page: its tabs, and every office in "ส่วนราชการ สตง." with the text of its chart boxes.
	// An office links to #office-<slug>; the page opens the tab (and region) holding it and expands its chart.
	const structurePage = pages.entries.find((p) => p.data.show_structure_tabs);
	const structureUrl = structurePage ? `/${encodeURIComponent(structurePage.id)}` : "/";
	const structureLabel = structurePage?.data.title ?? "โครงสร้าง";
	for (const t of structureTabs.entries) {
		out.push({
			title: t.data.title,
			body: `${extractPlainText(t.data.content)} ${t.data.attachment_text ?? ""} ${structureLabel}`,
			hit: { type: "structure", typeLabel: structureLabel, title: t.data.title, url: `${structureUrl}#${encodeURIComponent(t.id)}` },
		});
	}
	const tabFor = (category?: string | null) => {
		const display =
			category === "สำนักสนับสนุน" || category === "สำนักตรวจสอบส่วนกลาง"
				? `ตารางส่วนราชการ: ${category}`
				: "แผนที่ภาค: สตภ. และ สตจ.";
		return (
			structureTabs.entries.find((t) => t.data.display === display) ??
			structureTabs.entries.find((t) => t.data.display === "ตารางส่วนราชการ: ทั้งหมด")
		);
	};
	for (const o of offices.entries) {
		const boxes = (o.data.chart_boxes ?? [])
			.map((b) => `${b.title ?? ""} ${String(b.positions ?? "").replace(/\s*[=:]\s*[0-9๐-๙]+\s*$/gm, "")}`)
			.join(" ");
		const tab = tabFor(o.data.category);
		out.push({
			title: o.data.title,
			body: `${o.data.abbr ?? ""} ${o.data.name_en ?? ""} ${o.data.email ?? ""} ${o.data.category ?? ""} ผังโครงสร้าง ${boxes}`,
			sortDate: -(o.data.sort_order ?? 0),
			exact: [o.data.title, o.data.abbr ?? "", o.data.name_en ?? ""],
			hit: {
				type: "office",
				typeLabel: `${structureLabel} · ${tab?.data.title ?? "ผังโครงสร้าง"}`,
				title: o.data.abbr ? `${o.data.title} (${o.data.abbr})` : o.data.title,
				url: `${structureUrl}#office-${encodeURIComponent(o.id)}`,
			},
		});
	}
	for (const e of executives.entries) {
		out.push({
			title: e.data.title,
			body: `${e.data.position ?? ""} ผู้บริหาร โครงสร้างสำนัก`,
			hit: {
				type: "executive",
				typeLabel: `${aboutLabel} · ผู้บริหาร`,
				title: e.data.title,
				url: `${aboutUrl}#exec-${encodeURIComponent(e.id)}`,
				image: mediaUrl(e.data.photo),
			},
		});
	}
	for (const u of orgUnits.entries) {
		const positions = (u.data.positions ?? []).map((p) => p.name).join(" ");
		out.push({
			title: u.data.title,
			body: `${positions} ผังโครงสร้างสำนัก`,
			hit: {
				type: "org-unit",
				typeLabel: `${aboutLabel} · ผังโครงสร้างสำนัก`,
				title: u.data.title,
				url: `${aboutUrl}#org-${encodeURIComponent(u.id)}`,
			},
		});
	}

	// Assignment orders and the office ↔ auditee lists live on the page with the auditee finder.
	const auditPage = pages.entries.find((p) => p.data.show_auditee_finder);
	const auditUrl = auditPage ? `/${encodeURIComponent(auditPage.id)}` : "/";
	for (const o of auditOrders.entries) {
		const key = o.data.file?.meta?.storageKey;
		const pdf = typeof key === "string" && key.toLowerCase().endsWith(".pdf") ? `/files/pdf/${encodeURIComponent(key)}` : undefined;
		out.push({
			title: o.data.title,
			body: "คำสั่งมอบหมายหน่วยรับตรวจ",
			hit: {
				type: "audit-order",
				typeLabel: "คำสั่งมอบหมายหน่วยรับตรวจ",
				title: o.data.title,
				url: pdf ?? (o.data.link || auditUrl),
				external: !!(pdf || o.data.link),
			},
		});
	}
	for (const o of auditOffices.entries) {
		out.push({
			title: `${o.data.title} ${o.data.subtitle ?? ""}`.trim(),
			body: `${(o.data.auditees ?? "").replace(/\s*\*$/gm, "")} ${o.data.note ?? ""} หน่วยรับตรวจ`,
			hit: {
				type: "audit-office",
				typeLabel: "หน่วยรับตรวจ · สำนักที่รับผิดชอบ",
				title: `${o.data.title} ${o.data.subtitle ?? ""}`.trim(),
				url: `${auditUrl}?office=${encodeURIComponent(o.id)}#finder`,
			},
		});
	}

	return out;
}

export async function searchSite(rawQuery: string, limit = 50): Promise<SearchHit[]> {
	const query = normalize(rawQuery);
	if (!query) return [];

	const ranked: { hit: SearchHit; score: number; sortDate: number }[] = [];
	for (const c of await collectCandidates()) {
		const bare = (t: string) => normalize(t).replace(/[.\s]/g, "");
		const isExact = !!c.exact?.some((n) => n && bare(n) === bare(query));
		const inTitle = isExact || normalize(c.title).includes(query);
		const inBody = !inTitle && normalize(c.body).includes(query);
		if (!inTitle && !inBody) continue;
		ranked.push({
			hit: {
				...c.hit,
				snippet: inBody ? snippetAround(c.body, query) : "",
				// An auditee name opens the finder already filtered to it.
				url: c.hit.type === "audit-office" && inBody ? c.hit.url.replace(/\?office=[^#]*/, `?q=${encodeURIComponent(rawQuery.trim())}`) : c.hit.url,
			},
			score: isExact ? 3 : inTitle ? 2 : 1,
			sortDate: c.sortDate ?? 0,
		});
	}

	ranked.sort((a, b) => b.score - a.score || b.sortDate - a.sortDate);
	return ranked.slice(0, limit).map((r) => r.hit);
}
