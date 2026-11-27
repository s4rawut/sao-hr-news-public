import type { APIRoute } from "astro";
import { audit, relyingParty, verifyPasskeyRegistration } from "../../../../lib/admin/auth";
import { fail, json } from "../../../../admin/api";

export const POST: APIRoute = async ({ request, url, locals }) => {
	try {
		const body = await request.json();
		verifyPasskeyRegistration(relyingParty(url), locals.user!, body.response, String(body.name ?? ""));
		audit(locals.user!.id, "auth.passkey.add", "user", locals.user!.id);
		return json({ ok: true });
	} catch (e) {
		return fail((e as Error).message || "ลงทะเบียนไม่สำเร็จ");
	}
};
