import type { APIRoute } from "astro";
import { passkeyRegisterOptions, relyingParty } from "../../../../lib/admin/auth";
import { getSiteSettings } from "../../../../lib/cms";
import { json } from "../../../../admin/api";

export const POST: APIRoute = async ({ url, locals }) => {
	const settings = await getSiteSettings();
	return json(passkeyRegisterOptions(relyingParty(url), locals.user!, (settings.title as string) || "เว็บไซต์"));
};
