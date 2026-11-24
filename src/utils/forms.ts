import { mediaUrl } from "./site-info";

export const FORM_TAXONOMY = "form_category";

interface FormData {
	file?: { src?: string; url?: string; filename?: string; meta?: Record<string, unknown> };
	link?: string;
}

/** Where a form item points: the attached file first, otherwise its external link. */
export function formHref(data: FormData) {
	return mediaUrl(data.file) ?? (data.link || undefined);
}

/** Short file-type label such as "PDF" or "DOCX", from the attachment's filename. */
export function formFileType(data: FormData) {
	const name = data.file?.filename ?? (typeof data.file?.meta?.storageKey === "string" ? data.file.meta.storageKey : "");
	const ext = name.split(".").pop();
	return ext && ext !== name ? ext.toUpperCase() : undefined;
}

export const AUDIENCE_TAXONOMY = "form_audience";

/** Selected audience from ?for= (a real term slug), otherwise the first audience — there is no "all" view. */
export function selectedAudience(url: URL, audiences: { slug: string }[]) {
	const value = url.searchParams.get("for");
	return audiences.some((a) => a.slug === value) ? value! : audiences[0]?.slug;
}

/** Appends ?for= to a forms URL when an audience is selected. */
export function withAudience(path: string, audience: string | undefined) {
	return audience ? `${path}?for=${encodeURIComponent(audience)}` : path;
}

/**
 * Which categories each audience sees on the forms page (term slugs, in display order is set
 * by the term order in admin). A category not listed here appears only for an audience that
 * has at least one form in it, so a category added later in admin shows up once it has forms.
 */
const ALL_CIVIL_SERVANT = [
	"id-card", "kp7", "leave", "resign", "relocation", "transfer", "secondment", "study-report",
	"certificate", "welfare", "bank-loan", "hr-database", "education-consent", "pension", "meeting-room",
];
export const CATEGORY_AUDIENCES: Record<string, string[]> = Object.fromEntries(
	ALL_CIVIL_SERVANT.map((slug) => [slug, ["civil-servant"]]),
);
for (const slug of ["id-card", "leave", "resign", "study-report", "certificate", "welfare", "bank-loan"]) {
	CATEGORY_AUDIENCES[slug]!.push("employee");
}

/** Icon shown beside each category name (names from Icon.astro); unknown slugs get a file icon. */
export const CATEGORY_ICONS: Record<string, string> = {
	"id-card": "user",
	kp7: "clipboard",
	leave: "chat",
	resign: "close",
	relocation: "share",
	transfer: "trend",
	secondment: "users",
	"study-report": "chat-dots",
	certificate: "check",
	welfare: "heart",
	"bank-loan": "cash",
	"hr-database": "user-plus",
	"education-consent": "users",
	pension: "users",
	"meeting-room": "calendar-check",
};

/** Whether a category is shown for the selected audience. */
export function categoryShownFor(slug: string, audience: string | undefined, hasForms: boolean) {
	if (!audience) return true;
	const listed = CATEGORY_AUDIENCES[slug];
	return hasForms || (listed?.includes(audience) ?? false);
}

export type PreviewKind = "pdf" | "image" | "link" | "file";

export interface FormPreview {
	kind: PreviewKind;
	/** What the preview window shows (PDF viewer URL, image URL, or embeddable page URL) */
	view: string;
	/** File to save from the Download button (files only) */
	download?: string;
	downloadName?: string;
	/** Address opened by "เปิดในแท็บใหม่" */
	open: string;
}

/**
 * Google pages refuse to load inside another site unless their embed address is used,
 * so links to Drive folders/files and Google Forms are rewritten to those addresses.
 */
export function embeddableUrl(link: string): string {
	try {
		const u = new URL(link);
		if (u.hostname === "drive.google.com") {
			const folder = u.pathname.match(/\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/);
			if (folder) return `https://drive.google.com/embeddedfolderview?id=${folder[1]}#list`;
			const file = u.pathname.match(/\/file\/d\/([\w-]+)/);
			if (file) return `https://drive.google.com/file/d/${file[1]}/preview`;
		}
		if (u.hostname === "docs.google.com" && u.pathname.startsWith("/forms/")) {
			u.searchParams.set("embedded", "true");
			return u.toString();
		}
	} catch {
		// not a valid URL — fall through and use it as given
	}
	return link;
}

/** How a form item opens in the preview window, or undefined when it has nothing to open. */
export function formPreview(data: FormData): FormPreview | undefined {
	const fileUrl = mediaUrl(data.file);
	if (fileUrl) {
		const name = data.file?.filename ?? "";
		const key = data.file?.meta?.storageKey;
		const mime = (data.file as { mimeType?: string } | undefined)?.mimeType ?? "";
		const lower = (name || (typeof key === "string" ? key : "")).toLowerCase();
		if (mime === "application/pdf" || lower.endsWith(".pdf")) {
			const view =
				typeof key === "string"
					? `/files/pdf/${encodeURIComponent(key)}${name ? `?name=${encodeURIComponent(name)}` : ""}`
					: fileUrl;
			return { kind: "pdf", view, download: fileUrl, downloadName: name, open: view };
		}
		if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(lower)) {
			return { kind: "image", view: fileUrl, download: fileUrl, downloadName: name, open: fileUrl };
		}
		return { kind: "file", view: "", download: fileUrl, downloadName: name, open: fileUrl };
	}
	if (data.link) return { kind: "link", view: embeddableUrl(data.link), open: data.link };
	return undefined;
}
