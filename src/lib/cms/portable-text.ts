/**
 * Portable Text → HTML. Covers what the content uses (paragraphs, headings, bullet/number lists,
 * bold/italic/underline/strike/code, links, image and file blocks) and what the new admin's editor
 * produces. All text is escaped; link URLs are limited to safe schemes.
 */

type Span = { _type: "span"; text?: string; marks?: string[] };
type MarkDef = { _key: string; _type: string; href?: string; blank?: boolean };
type Block = {
	_type: string;
	_key?: string;
	style?: string;
	listItem?: "bullet" | "number" | string;
	level?: number;
	children?: Span[];
	markDefs?: MarkDef[];
	[k: string]: unknown;
};

const esc = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function safeHref(href: unknown): string | undefined {
	if (typeof href !== "string") return undefined;
	const h = href.trim();
	if (/^(https?:|mailto:|tel:)/i.test(h) || h.startsWith("/") || h.startsWith("#")) return h;
	if (!/^[a-z][a-z\d+\-.]*:/i.test(h)) return h; // relative
	return undefined;
}

const SIMPLE_MARKS: Record<string, string> = {
	strong: "strong",
	em: "em",
	underline: "u",
	"strike-through": "s",
	strike: "s",
	code: "code",
};

function renderSpans(block: Block): string {
	const defs = new Map((block.markDefs ?? []).map((d) => [d._key, d]));
	return (block.children ?? [])
		.map((span) => {
			if (span?._type !== "span") return "";
			let html = esc(span.text ?? "").replace(/\n/g, "<br>");
			for (const mark of span.marks ?? []) {
				const tag = SIMPLE_MARKS[mark];
				if (tag) {
					html = `<${tag}>${html}</${tag}>`;
					continue;
				}
				const def = defs.get(mark);
				if (def?._type === "link") {
					const href = safeHref(def.href);
					if (href) {
						const ext = def.blank || /^https?:/i.test(href);
						html = `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${html}</a>`;
					}
				}
			}
			return html;
		})
		.join("");
}

function mediaSrc(node: Record<string, any>): string | undefined {
	const key = node.asset?.meta?.storageKey ?? node.meta?.storageKey;
	if (typeof key === "string") return `/_emdash/api/media/file/${key}`;
	return safeHref(node.asset?.url ?? node.asset?.src ?? node.url ?? node.src);
}

function renderBlock(b: Block): string {
	if (b._type === "block") {
		const inner = renderSpans(b);
		const style = b.style ?? "normal";
		if (/^h[1-6]$/.test(style)) return `<${style}>${inner}</${style}>`;
		if (style === "blockquote") return `<blockquote>${inner}</blockquote>`;
		return `<p>${inner}</p>`;
	}
	if (b._type === "image") {
		const src = mediaSrc(b as Record<string, any>);
		if (!src) return "";
		const alt = esc(String((b as any).alt ?? ""));
		const caption = (b as any).caption ? `<figcaption>${esc(String((b as any).caption))}</figcaption>` : "";
		return `<figure class="pt-image"><img src="${esc(src)}" alt="${alt}" loading="lazy" decoding="async">${caption}</figure>`;
	}
	if (b._type === "file") {
		const url = safeHref((b as any).url);
		if (!url) return "";
		const name = String((b as any).filename || url.split("/").pop()?.split("?")[0] || "ดาวน์โหลด");
		return `<div class="emdash-file"><a href="${esc(url)}" class="emdash-file__link" download="${esc(name)}"><span class="emdash-file__name">${esc(name)}</span></a></div>`;
	}
	if (b._type === "break") return "<hr>";
	return "";
}

/** Render a Portable Text value (array of blocks) to an HTML string. */
export function portableTextToHtml(value: unknown): string {
	const blocks: Block[] = Array.isArray(value) ? value : value && typeof value === "object" ? [value as Block] : [];
	let html = "";
	// open lists as a stack of [tag, level]
	const stack: { tag: string; level: number }[] = [];
	const closeTo = (level: number) => {
		while (stack.length && stack[stack.length - 1].level > level) html += `</li></${stack.pop()!.tag}>`;
	};
	for (const b of blocks) {
		if (b?._type === "block" && b.listItem) {
			const level = Math.max(1, Number(b.level) || 1);
			const tag = b.listItem === "number" ? "ol" : "ul";
			closeTo(level);
			const top = stack[stack.length - 1];
			if (!top || top.level < level) {
				html += `<${tag}>`;
				stack.push({ tag, level });
			} else if (top.tag !== tag) {
				html += `</li></${stack.pop()!.tag}><${tag}>`;
				stack.push({ tag, level });
			} else {
				html += "</li>";
			}
			html += `<li>${renderSpans(b)}`;
			continue;
		}
		closeTo(0);
		html += renderBlock(b);
	}
	closeTo(0);
	return html;
}
