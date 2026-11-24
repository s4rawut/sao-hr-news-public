import type { APIRoute } from "astro";

/** Shortcut: /admin → the EmDash admin UI. */
export const GET: APIRoute = ({ redirect }) => redirect("/_emdash/admin", 302);
