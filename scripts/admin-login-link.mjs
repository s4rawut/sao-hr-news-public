// One-time sign-in link for an admin, for when nobody can sign in at the site's address yet
// (e.g. first sign-in after moving to a new domain: passkeys made on the old address don't work there).
// It does what admin → "sign-in handover" does, but from the server, so only people who can run
// commands on the server can make a link. The link works once, expires after 15 minutes, and opens
// Security settings ready to add a passkey.
//
// Run in the folder that holds data.db (in the container: /data, the default working directory):
//   node admin-login-link.mjs [site-url] [email]
// site-url defaults to EMDASH_SITE_URL, then FALLBACK_SITE_URL (give the new address after a domain change); email defaults to the only active admin that is not the
// development account.
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { generateTokenWithHash } from "@emdash-cms/auth";

const EXPIRY_MS = 15 * 60 * 1000;
const REDIRECT = "/_emdash/admin/settings/security?addPasskey=1";
const ADMIN_ROLE = 50;

const [siteArg, emailArg] = process.argv.slice(2);
const fail = (msg) => {
	console.error(`admin-login-link: ${msg}`);
	process.exit(1);
};

const site = siteArg || process.env.EMDASH_SITE_URL || process.env.SITE_URL || process.env.FALLBACK_SITE_URL;
if (!site || !URL.canParse(site)) fail("give the site address, e.g. https://dev-hr-sao.audit.go.th (or set EMDASH_SITE_URL)");
const origin = new URL(site);
const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
if (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback)) {
	fail(`the address must start with https:// (got ${origin.origin}); admin sign-in needs HTTPS`);
}
if (!existsSync("data.db")) fail(`no data.db in ${process.cwd()}`);

const db = new DatabaseSync("data.db");
db.exec("PRAGMA busy_timeout = 10000");
const admins = db
	.prepare("SELECT id, email, name FROM users WHERE role >= ? AND (disabled IS NULL OR disabled = 0) ORDER BY created_at")
	.all(ADMIN_ROLE)
	.filter((u) => u.email !== "dev@emdash.local");
let user;
if (emailArg) {
	user = admins.find((u) => u.email.toLowerCase() === emailArg.toLowerCase());
	if (!user) fail(`no active admin with email ${emailArg}. Admins: ${admins.map((u) => u.email).join(", ") || "none"}`);
} else if (admins.length === 1) {
	user = admins[0];
} else {
	fail(`more than one admin — add the email as the 2nd argument: ${admins.map((u) => u.email).join(", ") || "none"}`);
}

const { token, hash } = generateTokenWithHash();
const now = new Date();
db.prepare(
	"INSERT INTO auth_tokens (hash, user_id, email, type, role, invited_by, expires_at, created_at) VALUES (?, ?, ?, 'magic_link', NULL, NULL, ?, ?)",
).run(hash, user.id, user.email, new Date(now.getTime() + EXPIRY_MS).toISOString(), now.toISOString());
db.close();

const url = new URL("/_emdash/api/auth/magic-link/verify", origin.origin);
url.searchParams.set("token", token);
url.searchParams.set("redirect", REDIRECT);
console.log(`Sign-in link for ${user.name || user.email} (${user.email}) — works once, expires in 15 minutes:\n\n${url}\n`);
