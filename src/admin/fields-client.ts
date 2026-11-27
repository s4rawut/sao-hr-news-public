/**
 * Interactive edit-page fields: media picker (choose / upload), rich text editor (Portable Text),
 * repeater rows, reference pickers, Thai date labels. Each keeps its value as JSON in a hidden
 * input, so the form posts normally.
 */

type Media = {
	id: string;
	filename: string;
	mimeType: string;
	width?: number;
	height?: number;
	alt?: string;
	src?: string;
	provider?: string;
	meta?: { storageKey?: string };
	size?: number;
};

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === "class") el.className = v;
		else if (k === "text") el.textContent = v;
		else el.setAttribute(k, v);
	}
	for (const k of kids) el.append(k);
	return el;
};
const key = () => Math.random().toString(36).slice(2, 10);
const mediaSrc = (m: Media) => (m.meta?.storageKey ? `/_emdash/api/media/file/${m.meta.storageKey}` : (m.src ?? ""));
const isImage = (m: Media) => String(m.mimeType ?? "").startsWith("image/");
const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const fmtSize = (n?: number) => (!n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/* ===================== media dialog ===================== */

let dialog: HTMLDialogElement | undefined;
let resolver: ((m: Media | null) => void) | undefined;
let state = { kind: "", q: "", page: 1, pages: 1, accept: "" };

function buildDialog() {
	dialog = h("dialog", { class: "adm-dialog" });
	dialog.innerHTML = `
		<div class="dlg-head"><h2>เลือกไฟล์</h2>
			<input type="search" placeholder="ค้นหาชื่อไฟล์…" data-q style="max-width:240px">
			<select data-kind style="width:auto"><option value="">ทุกชนิด</option><option value="image">รูปภาพ</option><option value="video">วิดีโอ</option><option value="document">เอกสาร</option></select>
			<button type="button" class="btn ghost sm" data-close>ปิด</button></div>
		<div class="dlg-body">
			<label class="dropzone" data-drop><span><strong>ลากไฟล์มาวาง</strong> หรือคลิกเพื่ออัปโหลด (สูงสุด 200 MB)<br><span data-up-status></span></span>
				<input type="file" multiple hidden data-file></label>
			<div class="media-grid" data-grid></div>
			<div style="text-align:center;margin-top:14px"><button type="button" class="btn sm" data-more hidden>โหลดเพิ่ม</button></div>
		</div>`;
	document.body.append(dialog);
	const grid = dialog.querySelector<HTMLElement>("[data-grid]")!;
	const q = dialog.querySelector<HTMLInputElement>("[data-q]")!;
	const kind = dialog.querySelector<HTMLSelectElement>("[data-kind]")!;
	const more = dialog.querySelector<HTMLButtonElement>("[data-more]")!;
	const file = dialog.querySelector<HTMLInputElement>("[data-file]")!;
	const drop = dialog.querySelector<HTMLElement>("[data-drop]")!;
	const status = dialog.querySelector<HTMLElement>("[data-up-status]")!;
	dialog.querySelector("[data-close]")!.addEventListener("click", () => close(null));
	dialog.addEventListener("cancel", (e) => {
		e.preventDefault();
		close(null);
	});
	let t: ReturnType<typeof setTimeout>;
	q.addEventListener("input", () => {
		clearTimeout(t);
		t = setTimeout(() => load(true), 300);
	});
	kind.addEventListener("change", () => load(true));
	more.addEventListener("click", () => load(false));
	const upload = async (files: FileList | File[]) => {
		const list = [...files];
		if (!list.length) return;
		status.textContent = `กำลังอัปโหลด ${list.length} ไฟล์…`;
		const fd = new FormData();
		for (const f of list) fd.append("files", f);
		try {
			const res = await fetch("/admin/api/media", { method: "POST", body: fd });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "อัปโหลดไม่สำเร็จ");
			status.textContent = "อัปโหลดแล้ว";
			if (data.items.length === 1) return close(data.items[0]);
			await load(true);
		} catch (e) {
			status.textContent = (e as Error).message;
		}
	};
	file.addEventListener("change", () => upload(file.files ?? []));
	drop.addEventListener("dragover", (e) => {
		e.preventDefault();
		drop.classList.add("over");
	});
	drop.addEventListener("dragleave", () => drop.classList.remove("over"));
	drop.addEventListener("drop", (e) => {
		e.preventDefault();
		drop.classList.remove("over");
		upload(e.dataTransfer?.files ?? []);
	});

	async function load(reset: boolean) {
		if (reset) {
			state.page = 1;
			grid.innerHTML = "";
		} else state.page++;
		const params = new URLSearchParams({ q: q.value, kind: kind.value, page: String(state.page) });
		const data = await (await fetch(`/admin/api/media?${params}`)).json();
		state.pages = data.pages;
		for (const m of data.rows as Media[]) {
			const card = h("button", { type: "button", class: "media-card", title: m.filename });
			const thumb = h("span", { class: "media-thumb" });
			if (isImage(m)) thumb.append(h("img", { src: mediaSrc(m), alt: "", loading: "lazy" }));
			else thumb.textContent = (m.filename.split(".").pop() ?? "").toUpperCase();
			card.append(thumb, h("span", { class: "name", text: m.filename }), h("span", { class: "muted small", text: fmtSize(m.size) }));
			card.addEventListener("click", () => close(m));
			grid.append(card);
		}
		if (!grid.children.length) grid.append(h("p", { class: "muted", text: "ไม่พบไฟล์" }));
		more.hidden = state.page >= state.pages;
	}
	(dialog as any)._load = load;
}

function close(m: Media | null) {
	dialog?.close();
	resolver?.(m);
	resolver = undefined;
}

export function pickMedia(kind: "image" | "file"): Promise<Media | null> {
	if (!dialog) buildDialog();
	const sel = dialog!.querySelector<HTMLSelectElement>("[data-kind]")!;
	sel.value = kind === "image" ? "image" : "";
	dialog!.querySelector<HTMLElement>("[data-up-status]")!.textContent = "";
	dialog!.querySelector<HTMLInputElement>("[data-file]")!.accept = kind === "image" ? "image/*" : "";
	(dialog as any)._load(true);
	dialog!.showModal();
	return new Promise((r) => (resolver = r));
}

/* ===================== single image / file field ===================== */

function initMediaField(root: HTMLElement, onChange?: () => void) {
	const input = root.querySelector<HTMLInputElement>("[data-value]")!;
	const thumb = root.querySelector<HTMLElement>("[data-thumb]")!;
	const info = root.querySelector<HTMLElement>("[data-info]")!;
	const clear = root.querySelector<HTMLButtonElement>("[data-clear]")!;
	const alt = root.querySelector<HTMLInputElement>("[data-alt]");
	const kind = (root.dataset.kind as "image" | "file") ?? "file";
	const set = (m: Media | null) => {
		if (m && alt && !m.alt && alt.value) m.alt = alt.value;
		input.value = m ? JSON.stringify(m) : "";
		thumb.innerHTML = "";
		if (m && isImage(m)) thumb.append(h("img", { src: mediaSrc(m), alt: "" }));
		else thumb.textContent = m ? (m.filename.split(".").pop() ?? "").toUpperCase() : kind === "image" ? "รูป" : "ไฟล์";
		info.innerHTML = "";
		if (m) {
			info.append(h("strong", { text: m.filename }));
			const a = h("a", { href: mediaSrc(m), target: "_blank", rel: "noopener", text: "เปิดดู" });
			info.append(h("div", {}, a));
		} else info.append(h("span", { class: "muted", text: kind === "image" ? "ยังไม่ได้เลือกรูป" : "ยังไม่ได้เลือกไฟล์" }));
		if (alt) alt.value = m?.alt ?? "";
		clear.hidden = !m;
		input.dispatchEvent(new Event("change", { bubbles: true }));
		onChange?.();
	};
	root.querySelector("[data-pick]")!.addEventListener("click", async () => {
		const m = await pickMedia(kind);
		if (m) set(m);
	});
	clear.addEventListener("click", () => set(null));
	alt?.addEventListener("input", () => {
		if (!input.value) return;
		const m = JSON.parse(input.value) as Media;
		m.alt = alt.value;
		input.value = JSON.stringify(m);
		onChange?.();
	});
}

/* ===================== reference picker ===================== */

function initReference(root: HTMLElement) {
	const input = root.querySelector<HTMLInputElement>("[data-value]")!;
	const picked = root.querySelector<HTMLElement>("[data-picked]")!;
	const add = root.querySelector<HTMLSelectElement>("[data-add-ref]")!;
	const options = JSON.parse(root.dataset.options || "[]") as { id: string; title: string }[];
	const max = Number(root.dataset.max) || 0;
	let ids = input.value ? input.value.split(",").filter(Boolean) : [];
	const render = () => {
		input.value = ids.join(",");
		picked.innerHTML = "";
		ids.forEach((id, i) => {
			const o = options.find((x) => x.id === id);
			const chip = h("div", { class: "ref-chip" }, h("span", { text: o?.title ?? id }));
			const btn = (label: string, fn: () => void, disabled = false) => {
				const b = h("button", { type: "button", class: "btn sm ghost", text: label });
				b.disabled = disabled;
				b.addEventListener("click", () => {
					fn();
					render();
					input.dispatchEvent(new Event("change", { bubbles: true }));
				});
				return b;
			};
			chip.append(
				btn("↑", () => ([ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]), i === 0),
				btn("↓", () => ([ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]), i === ids.length - 1),
				btn("เอาออก", () => ids.splice(i, 1)),
			);
			picked.append(chip);
		});
		add.hidden = max > 0 && ids.length >= max;
		for (const opt of add.options) if (opt.value) opt.disabled = ids.includes(opt.value);
	};
	add.addEventListener("change", () => {
		if (add.value && !ids.includes(add.value)) ids.push(add.value);
		add.value = "";
		render();
		input.dispatchEvent(new Event("change", { bubbles: true }));
	});
	render();
}

/* ===================== repeater ===================== */

type Sub = { slug: string; label: string; type: string; required?: boolean; options?: string[] };

function initRepeater(root: HTMLElement) {
	const input = root.querySelector<HTMLInputElement>("[data-value]")!;
	const list = root.querySelector<HTMLElement>("[data-list]")!;
	const subs = JSON.parse(root.dataset.subfields || "[]") as Sub[];
	let items: Record<string, unknown>[] = [];
	try {
		items = JSON.parse(input.value || "[]");
	} catch {
		items = [];
	}
	const save = () => {
		input.value = JSON.stringify(items);
		input.dispatchEvent(new Event("change", { bubbles: true }));
	};
	const render = () => {
		list.innerHTML = "";
		items.forEach((item, i) => {
			const box = h("div", { class: "rep-item" });
			const head = h("div", { class: "rep-head" }, h("span", { text: `รายการที่ ${i + 1}` }));
			const btn = (label: string, fn: () => void, disabled = false, danger = false) => {
				const b = h("button", { type: "button", class: `btn sm ${danger ? "danger" : "ghost"}`, text: label });
				b.disabled = disabled;
				b.addEventListener("click", () => {
					fn();
					save();
					render();
				});
				return b;
			};
			head.append(
				btn("↑", () => ([items[i - 1], items[i]] = [items[i], items[i - 1]]), i === 0),
				btn("↓", () => ([items[i + 1], items[i]] = [items[i], items[i + 1]]), i === items.length - 1),
				btn("ลบ", () => items.splice(i, 1), false, true),
			);
			const grid = h("div", { class: "rep-fields" });
			for (const s of subs) {
				const wrap = h("div", { class: "field" });
				const label = h("label", { class: "field-label", text: s.label + (s.required ? " *" : "") });
				const v = item[s.slug];
				if (s.type === "boolean") {
					const cb = h("input", { type: "checkbox" }) as HTMLInputElement;
					cb.checked = v === true || v === 1;
					cb.addEventListener("change", () => {
						item[s.slug] = cb.checked;
						save();
					});
					wrap.append(h("label", { class: "check" }, cb, s.label));
				} else if (s.type === "image" || s.type === "file") {
					wrap.classList.add("wide");
					const m = (v && typeof v === "object" ? v : null) as Media | null;
					const mf = h("div", { class: "media-field", "data-kind": s.type });
					mf.innerHTML = `<input type="hidden" data-value><div class="media-thumb" data-thumb></div><div class="media-info" data-info></div>
						<div class="media-actions"><button type="button" class="btn sm" data-pick>เลือก / อัปโหลด</button><button type="button" class="btn sm ghost" data-clear>เอาออก</button></div>`;
					const hidden = mf.querySelector<HTMLInputElement>("[data-value]")!;
					hidden.value = m ? JSON.stringify(m) : "";
					initMediaField(mf, () => {
						item[s.slug] = hidden.value ? JSON.parse(hidden.value) : null;
						save();
					});
					// draw the current value
					const thumb = mf.querySelector<HTMLElement>("[data-thumb]")!;
					const info = mf.querySelector<HTMLElement>("[data-info]")!;
					mf.querySelector<HTMLButtonElement>("[data-clear]")!.hidden = !m;
					if (m && isImage(m)) thumb.append(h("img", { src: mediaSrc(m), alt: "" }));
					info.append(m ? h("strong", { text: m.filename }) : h("span", { class: "muted", text: "ยังไม่ได้เลือก" }));
					wrap.append(label, mf);
				} else if (s.type === "text") {
					wrap.classList.add("wide");
					const ta = h("textarea", { rows: "3" }) as HTMLTextAreaElement;
					ta.value = v == null ? "" : String(v);
					ta.addEventListener("input", () => {
						item[s.slug] = ta.value;
						save();
					});
					wrap.append(label, ta);
				} else if (s.type === "select" && s.options?.length) {
					const sel = h("select") as HTMLSelectElement;
					sel.append(h("option", { value: "", text: "— ไม่ระบุ —" }));
					for (const o of s.options) sel.append(h("option", { text: o }));
					sel.value = v == null ? "" : String(v);
					sel.addEventListener("change", () => {
						item[s.slug] = sel.value || null;
						save();
					});
					wrap.append(label, sel);
				} else {
					const numeric = s.type === "integer" || s.type === "number";
					const inp = h("input", { type: numeric ? "number" : s.type === "url" ? "url" : "text" }) as HTMLInputElement;
					if (s.type === "integer") inp.step = "1";
					inp.value = v == null ? "" : String(v);
					inp.addEventListener("input", () => {
						item[s.slug] = numeric ? (inp.value === "" ? null : Number(inp.value)) : inp.value;
						save();
					});
					wrap.append(label, inp);
				}
				grid.append(wrap);
			}
			box.append(head, grid);
			list.append(box);
		});
		if (!items.length) list.append(h("p", { class: "muted small", text: "ยังไม่มีรายการ" }));
	};
	root.querySelector("[data-add]")!.addEventListener("click", () => {
		items.push({});
		save();
		render();
	});
	render();
}

/* ===================== rich text (Portable Text) ===================== */

type Span = { _type: "span"; _key: string; text: string; marks: string[] };
type Block = { _type: string; _key: string; style?: string; listItem?: string; level?: number; children?: Span[]; markDefs?: { _key: string; _type: string; href?: string }[]; [k: string]: unknown };

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MARK_TAG: Record<string, string> = { strong: "b", em: "i", underline: "u", "strike-through": "s", code: "code" };

function spansToHtml(b: Block) {
	const defs = new Map((b.markDefs ?? []).map((d) => [d._key, d]));
	return (b.children ?? [])
		.map((s) => {
			let html = escHtml(s.text ?? "").replace(/\n/g, "<br>");
			for (const m of s.marks ?? []) {
				if (MARK_TAG[m]) html = `<${MARK_TAG[m]}>${html}</${MARK_TAG[m]}>`;
				else if (defs.get(m)?._type === "link") html = `<a href="${escHtml(defs.get(m)!.href ?? "")}">${html}</a>`;
			}
			return html;
		})
		.join("");
}

function ptToHtml(blocks: Block[]): string {
	let out = "";
	const stack: { tag: string; level: number }[] = [];
	const closeTo = (lvl: number) => {
		while (stack.length && stack[stack.length - 1].level > lvl) out += `</li></${stack.pop()!.tag}>`;
	};
	for (const b of blocks) {
		if (b._type === "block" && b.listItem) {
			const lvl = Math.max(1, b.level ?? 1);
			const tag = b.listItem === "number" ? "ol" : "ul";
			closeTo(lvl);
			const top = stack[stack.length - 1];
			if (!top || top.level < lvl) {
				out += `<${tag}>`;
				stack.push({ tag, level: lvl });
			} else if (top.tag !== tag) {
				out += `</li></${stack.pop()!.tag}><${tag}>`;
				stack.push({ tag, level: lvl });
			} else out += "</li>";
			out += `<li>${spansToHtml(b) || "<br>"}`;
			continue;
		}
		closeTo(0);
		if (b._type === "block") {
			const st = b.style ?? "normal";
			const tag = /^h[1-6]$/.test(st) ? st : st === "blockquote" ? "blockquote" : "p";
			out += `<${tag}>${spansToHtml(b) || "<br>"}</${tag}>`;
		} else out += specialHtml(b);
	}
	closeTo(0);
	return out;
}

function specialHtml(b: Block) {
	const data = escHtml(JSON.stringify(b));
	if (b._type === "image") {
		const a = (b.asset ?? {}) as Record<string, any>;
		const src = a.meta?.storageKey ? `/_emdash/api/media/file/${a.meta.storageKey}` : (a.url ?? a.src ?? "");
		return `<figure contenteditable="false" data-pt="${data}"><img src="${escHtml(src)}" alt=""><figcaption>${escHtml(String(b.alt ?? ""))}</figcaption></figure>`;
	}
	if (b._type === "file") return `<div class="rte-file" contenteditable="false" data-pt="${data}">📎 ${escHtml(String(b.filename ?? b.url ?? "ไฟล์"))}</div>`;
	return `<div class="rte-file" contenteditable="false" data-pt="${data}">[${escHtml(b._type)}]</div>`;
}

function inlineToSpans(node: Node, marks: string[], defs: Block["markDefs"], out: Span[]) {
	if (node.nodeType === Node.TEXT_NODE) {
		const text = (node.textContent ?? "").replace(/ /g, " ");
		if (text) out.push({ _type: "span", _key: key(), text, marks: [...marks] });
		return;
	}
	if (!(node instanceof HTMLElement)) return;
	if (node.tagName === "BR") {
		out.push({ _type: "span", _key: key(), text: "\n", marks: [...marks] });
		return;
	}
	let m = marks;
	const tag = node.tagName;
	const style = node.getAttribute("style") ?? "";
	if (tag === "B" || tag === "STRONG" || /font-weight:\s*(bold|[6-9]00)/.test(style)) m = [...m, "strong"];
	if (tag === "I" || tag === "EM" || /font-style:\s*italic/.test(style)) m = [...m, "em"];
	if (tag === "U" || /text-decoration[^;]*underline/.test(style)) m = [...m, "underline"];
	if (tag === "S" || tag === "STRIKE" || tag === "DEL" || /line-through/.test(style)) m = [...m, "strike-through"];
	if (tag === "CODE") m = [...m, "code"];
	if (tag === "A") {
		const href = node.getAttribute("href");
		if (href) {
			const k = key();
			defs!.push({ _key: k, _type: "link", href });
			m = [...m, k];
		}
	}
	for (const c of node.childNodes) inlineToSpans(c, [...new Set(m)], defs, out);
}

function mergeSpans(spans: Span[]): Span[] {
	const out: Span[] = [];
	for (const s of spans) {
		const prev = out[out.length - 1];
		if (prev && prev.marks.join() === s.marks.join()) prev.text += s.text;
		else out.push(s);
	}
	// trim trailing line break that browsers leave in empty blocks
	if (out.length && out[out.length - 1].text === "\n") out.pop();
	return out;
}

function textBlock(el: Node, style: string, extra: Partial<Block> = {}): Block {
	const defs: NonNullable<Block["markDefs"]> = [];
	const spans: Span[] = [];
	for (const c of el.childNodes) {
		if (c instanceof HTMLElement && (c.tagName === "UL" || c.tagName === "OL")) continue;
		inlineToSpans(c, [], defs, spans);
	}
	const children = mergeSpans(spans);
	return { _type: "block", _key: key(), style, markDefs: defs, children: children.length ? children : [{ _type: "span", _key: key(), text: "", marks: [] }], ...extra };
}

function listToBlocks(list: HTMLElement, level: number, out: Block[]) {
	const kind = list.tagName === "OL" ? "number" : "bullet";
	for (const li of list.children) {
		if (li.tagName !== "LI") continue;
		out.push(textBlock(li, "normal", { listItem: kind, level }));
		for (const sub of li.children) if (sub.tagName === "UL" || sub.tagName === "OL") listToBlocks(sub as HTMLElement, level + 1, out);
	}
}

function htmlToPt(body: HTMLElement): Block[] {
	const out: Block[] = [];
	let loose: Node[] = [];
	const flushLoose = () => {
		if (!loose.length) return;
		const wrap = document.createElement("p");
		for (const n of loose) wrap.append(n.cloneNode(true));
		if ((wrap.textContent ?? "").trim()) out.push(textBlock(wrap, "normal"));
		loose = [];
	};
	for (const n of body.childNodes) {
		if (n instanceof HTMLElement && n.dataset.pt) {
			flushLoose();
			try {
				const b = JSON.parse(n.dataset.pt) as Block;
				if (b._type === "image") {
					const cap = n.querySelector("figcaption")?.textContent?.trim();
					if (cap !== undefined) b.alt = cap;
				}
				out.push(b);
			} catch {
				/* skip */
			}
			continue;
		}
		if (!(n instanceof HTMLElement)) {
			loose.push(n);
			continue;
		}
		const tag = n.tagName;
		if (["B", "STRONG", "I", "EM", "U", "S", "A", "SPAN", "CODE", "BR", "FONT"].includes(tag)) {
			loose.push(n);
			continue;
		}
		flushLoose();
		if (/^H[1-6]$/.test(tag)) out.push(textBlock(n, tag.toLowerCase()));
		else if (tag === "BLOCKQUOTE") out.push(textBlock(n, "blockquote"));
		else if (tag === "UL" || tag === "OL") listToBlocks(n, 1, out);
		else out.push(textBlock(n, "normal"));
	}
	flushLoose();
	// drop empty paragraphs at the end
	while (out.length && out[out.length - 1]._type === "block" && !out[out.length - 1].listItem && !(out[out.length - 1].children ?? []).some((c) => c.text.trim())) out.pop();
	return out;
}

function initRte(root: HTMLElement) {
	const input = root.querySelector<HTMLInputElement>("[data-value]")!;
	const body = root.querySelector<HTMLElement>("[data-body]")!;
	let blocks: Block[] = [];
	try {
		blocks = JSON.parse(input.value || "[]");
	} catch {
		blocks = [];
	}
	body.innerHTML = ptToHtml(Array.isArray(blocks) ? blocks : []);
	document.execCommand("defaultParagraphSeparator", false, "p");
	// the stored value is only rewritten once the text is actually edited
	let edited = false;
	const sync = () => {
		edited = true;
		input.value = JSON.stringify(htmlToPt(body));
	};
	body.addEventListener("input", sync);
	body.addEventListener("blur", () => edited && sync());
	input.form?.addEventListener("submit", () => edited && sync());
	// paste as plain text (keeps line breaks) so Word / web formatting doesn't come along
	body.addEventListener("paste", (e) => {
		const text = e.clipboardData?.getData("text/plain");
		if (text === undefined) return;
		e.preventDefault();
		const html = text
			.split(/\n{2,}/)
			.map((p) => `<p>${escHtml(p).replace(/\n/g, "<br>")}</p>`)
			.join("");
		document.execCommand("insertHTML", false, html);
	});
	root.querySelectorAll<HTMLButtonElement>("[data-cmd]").forEach((b) =>
		b.addEventListener("mousedown", (e) => {
			e.preventDefault();
			document.execCommand(b.dataset.cmd!, false);
			sync();
		}),
	);
	const blockSel = root.querySelector<HTMLSelectElement>("[data-block]")!;
	blockSel.addEventListener("change", () => {
		body.focus();
		document.execCommand("formatBlock", false, blockSel.value);
		blockSel.value = "p";
		sync();
	});
	root.querySelector("[data-link]")!.addEventListener("mousedown", (e) => {
		e.preventDefault();
		const url = prompt("ลิงก์ (เช่น https://… หรือ /posts/…)");
		if (url) document.execCommand("createLink", false, url.trim());
		sync();
	});
	root.querySelectorAll<HTMLButtonElement>("[data-insert]").forEach((b) =>
		b.addEventListener("click", async () => {
			const sel = window.getSelection();
			const range = sel && sel.rangeCount && body.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
			const m = await pickMedia(b.dataset.insert === "image" ? "image" : "file");
			if (!m) return;
			const src = mediaSrc(m);
			const block: Block =
				b.dataset.insert === "image"
					? { _type: "image", _key: key(), alt: m.alt ?? "", asset: { url: src, meta: { storageKey: m.meta?.storageKey } } }
					: { _type: "file", _key: key(), url: src, filename: m.filename };
			const holder = document.createElement("div");
			holder.innerHTML = specialHtml(block);
			const node = holder.firstElementChild!;
			// put it after the paragraph the cursor is in (or at the end)
			let anchor: Node | null = range?.startContainer ?? null;
			while (anchor && anchor.parentNode !== body) anchor = anchor.parentNode;
			if (anchor) anchor.parentNode!.insertBefore(node, anchor.nextSibling);
			else body.append(node);
			if (!node.nextSibling) body.append(Object.assign(document.createElement("p"), { innerHTML: "<br>" }));
			sync();
		}),
	);
	// click a picture or file in the editor to remove it
	body.addEventListener("click", (e) => {
		const el = (e.target as HTMLElement).closest<HTMLElement>("[data-pt]");
		if (el && confirm("เอารายการนี้ออกจากเนื้อหา?")) {
			el.remove();
			sync();
		}
	});
}

/* ===================== small things ===================== */

function initDates() {
	document.querySelectorAll<HTMLInputElement>("input[data-thai-date]").forEach((inp) => {
		const label = inp.parentElement?.querySelector<HTMLElement>("[data-thai-label]");
		const show = () => {
			if (!label) return;
			const m = inp.value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
			label.textContent = m ? `${Number(m[3])} ${thaiMonths[Number(m[2]) - 1]} ${Number(m[1]) + 543}${m[4] ? ` เวลา ${m[4]} น.` : ""}` : "";
		};
		inp.addEventListener("input", show);
		show();
	});
	document.querySelectorAll<HTMLInputElement>("input[data-color-for]").forEach((c) => {
		const text = document.getElementById(c.dataset.colorFor!) as HTMLInputElement | null;
		c.addEventListener("input", () => {
			if (text) text.value = c.value;
		});
		text?.addEventListener("input", () => {
			if (/^#[0-9a-f]{6}$/i.test(text.value)) c.value = text.value;
		});
	});
}

export function initFields() {
	document.querySelectorAll<HTMLElement>("[data-media-field]").forEach((el) => initMediaField(el));
	document.querySelectorAll<HTMLElement>("[data-reference]").forEach(initReference);
	document.querySelectorAll<HTMLElement>("[data-repeater]").forEach(initRepeater);
	document.querySelectorAll<HTMLElement>("[data-rte]").forEach(initRte);
	initDates();
}
