import type { APIRoute } from "astro";
import { createSession } from "../../../lib/admin/auth";
import { demoUserId, isDemo } from "../../../lib/admin/demo";
import { isSecure } from "../../../admin/api";

/** Demo copy only: sign in as the demo admin without a passkey. */
export const POST: APIRoute = ({ cookies, url, redirect }) => {
	if (!isDemo()) return new Response("Not found", { status: 404 });
	createSession(cookies, demoUserId(), isSecure(url));
	return redirect("/admin", 303);
};
