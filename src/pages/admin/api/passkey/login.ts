import type { APIRoute } from "astro";
import { audit, createSession, relyingParty, verifyPasskeyLogin } from "../../../../lib/admin/auth";
import { fail, isSecure, json } from "../../../../admin/api";
import { safeNext } from "../../../../admin/flash";

export const POST: APIRoute = async ({ request, url, cookies, clientAddress }) => {
	try {
		const body = await request.json();
		const user = verifyPasskeyLogin(relyingParty(url), body.response);
		createSession(cookies, user.id, isSecure(url));
		audit(user.id, "auth.login.passkey", "user", user.id, { ip: clientAddress });
		return json({ ok: true, next: safeNext(body.next) });
	} catch (e) {
		return fail((e as Error).message || "เข้าสู่ระบบไม่สำเร็จ", 401);
	}
};
