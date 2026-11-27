import type { AstroCookies } from "astro";

/** A one-time message shown at the top of the next admin page. */
export function setFlash(cookies: AstroCookies, kind: "ok" | "error", text: string) {
	cookies.set("hr_flash", encodeURIComponent(JSON.stringify({ kind, text })), { path: "/admin", httpOnly: true, sameSite: "lax", maxAge: 60 });
}

export const thaiDateTime = (v: unknown) => {
	if (!v) return "";
	const d = new Date(String(v));
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/** Only same-site paths are allowed as "go back to" targets. */
export const safeNext = (next: string | null | undefined, fallback = "/admin") =>
	next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
