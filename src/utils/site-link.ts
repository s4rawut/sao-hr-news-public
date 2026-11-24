/**
 * Links typed or pasted in admin ("ลิงก์เมื่อกดกิจกรรม", "ลิงก์", menu items …). A full address of
 * this site itself — copied from localhost or the real domain — is turned into a
 * site path (e.g. "http://localhost:4321/recruitments/x#recruit-y" → "/recruitments/x#recruit-y"),
 * so links keep working after the site moves to another server. Other sites are left as they are.
 */
const OWN_HOSTS = new Set(["localhost", "127.0.0.1"]);
const configured = (() => {
	try {
		const u = process.env.EMDASH_SITE_URL || process.env.SITE_URL;
		return u ? new URL(u).hostname : undefined;
	} catch {
		return undefined;
	}
})();
if (configured) OWN_HOSTS.add(configured);

export function siteLink(raw?: string | null): string {
	const link = (raw ?? "").trim();
	if (!/^https?:\/\//i.test(link)) return link;
	try {
		const u = new URL(link);
		const host = u.hostname.toLowerCase();
		if (OWN_HOSTS.has(host)) {
			return `${u.pathname}${u.search}${u.hash}` || "/";
		}
	} catch {
		// not a valid URL: leave it as typed
	}
	return link;
}

export const isExternal = (link: string) => /^https?:\/\//i.test(link);
