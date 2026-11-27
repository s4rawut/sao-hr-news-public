import type { APIRoute } from "astro";
import { passkeyLoginOptions, relyingParty } from "../../../../lib/admin/auth";
import { json } from "../../../../admin/api";

export const POST: APIRoute = ({ url }) => json(passkeyLoginOptions(relyingParty(url)));
