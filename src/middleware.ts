import { defineMiddleware } from "astro:middleware";
import { MEDIA_PREFIX, serveUpload } from "./lib/cms/media";
import { currentUser } from "./lib/admin/auth";

/** /admin pages anyone may open (sign-in). */
const PUBLIC_ADMIN = [/^\/admin\/login\/?$/, /^\/admin\/api\/demo-login$/];

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;

	// Uploaded files keep their old address (/_emdash/api/media/file/<key>), which is saved inside
	// content. Astro does not route folders starting with "_", so they are served here.
	if (pathname.startsWith(MEDIA_PREFIX) && (context.request.method === "GET" || context.request.method === "HEAD")) {
		return serveUpload(decodeURIComponent(pathname.slice(MEDIA_PREFIX.length)), context.request);
	}

	// old EmDash admin addresses → the new admin
	if (pathname === "/_emdash/admin" || pathname.startsWith("/_emdash/admin/")) {
		return context.redirect("/admin", 302);
	}
	if (pathname.startsWith("/_emdash/api/auth/")) return context.redirect("/admin/login", 302);

	if (pathname === "/admin" || pathname.startsWith("/admin/")) {
		const user = currentUser(context.cookies);
		if (user) context.locals.user = user;
		if (!user && !PUBLIC_ADMIN.some((re) => re.test(pathname))) {
			if (pathname.startsWith("/admin/api/")) {
				return new Response(JSON.stringify({ error: "กรุณาเข้าสู่ระบบ" }), { status: 401, headers: { "Content-Type": "application/json" } });
			}
			return context.redirect(`/admin/login?next=${encodeURIComponent(pathname + context.url.search)}`, 302);
		}
		const res = await next();
		res.headers.set("Cache-Control", "no-store");
		res.headers.set("X-Robots-Tag", "noindex, nofollow");
		res.headers.set("X-Frame-Options", "SAMEORIGIN");
		return res;
	}
	const res = await next();
	if (process.env.DEMO_MODE === "1") res.headers.set("X-Robots-Tag", "noindex, nofollow");
	return res;
});
