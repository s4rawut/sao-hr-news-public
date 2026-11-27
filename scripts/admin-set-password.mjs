// Set (or reset) an admin's password from the server — for the first sign-in on a new server, or
// when every admin has forgotten their password. Run in the folder that holds data.db
// (in the container: /data, the default working directory):
//
//   node admin-set-password.mjs                      list accounts
//   node admin-set-password.mjs <email>              asks for the new password (not shown on screen)
//   node admin-set-password.mjs <email> --new-admin  creates the account as an admin, then asks
//
// The password is stored only as a scrypt hash in users.password_hash.
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const [emailArg, flag] = process.argv.slice(2);
const fail = (msg) => {
	console.error(`admin-set-password: ${msg}`);
	process.exit(1);
};
if (!existsSync("data.db")) fail(`no data.db in ${process.cwd()}`);
const db = new DatabaseSync("data.db");
db.exec("PRAGMA busy_timeout = 10000");
if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'password_hash'").get()) {
	fail("the database has no password column yet — start the new version of the site once (it applies the database patch), then run this again");
}

if (!emailArg) {
	const rows = db
		.prepare("SELECT email, name, role, disabled, password_hash IS NOT NULL AS has_pw FROM users WHERE email <> 'dev@emdash.local' ORDER BY role DESC")
		.all();
	console.log("Accounts:");
	for (const r of rows) console.log(`  ${r.email}  ${r.name ?? ""}  role=${r.role}${r.disabled ? " (disabled)" : ""}${r.has_pw ? "" : "  [no password yet]"}`);
	console.log("\nSet a password: node admin-set-password.mjs <email>   (add --new-admin to create a new admin account)");
	process.exit(0);
}

const email = emailArg.trim().toLowerCase();
const user = db.prepare("SELECT id, email FROM users WHERE lower(email) = ?").get(email);
if (!user && flag !== "--new-admin") fail(`no account ${email} — add --new-admin to create it`);

/** Read a line without echoing it. */
function askHidden(question) {
	return new Promise((resolve) => {
		const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
		const write = rl._writeToOutput?.bind(rl);
		rl._writeToOutput = (s) => (s.includes(question) || !write ? write?.(s) : write("*"));
		rl.question(question, (answer) => {
			rl.close();
			process.stdout.write("\n");
			resolve(answer);
		});
	});
}

const password = process.env.NEW_PASSWORD ?? (await askHidden("New password: "));
if (!process.env.NEW_PASSWORD && password !== (await askHidden("Again: "))) fail("the two passwords differ");
if (password.length < 8) fail("the password must be at least 8 characters");

const salt = randomBytes(16);
const digest = scryptSync(password.normalize("NFC"), salt, 64, { N: 16384, r: 8, p: 1 });
const hash = `scrypt$16384$8$1$${salt.toString("base64")}$${digest.toString("base64")}`;
const now = new Date().toISOString();
if (!user) {
	const id = Date.now().toString(36).toUpperCase().padStart(10, "0") + randomBytes(8).toString("hex").toUpperCase();
	db.prepare(
		"INSERT INTO users (id, email, name, role, email_verified, created_at, updated_at, disabled, password_hash) VALUES (?, ?, NULL, 50, 1, ?, ?, 0, ?)",
	).run(id, email, now, now, hash);
	console.log(`Created admin ${email}. Sign in at <site>/admin with this email and password.`);
} else {
	db.prepare("UPDATE users SET password_hash = ?, disabled = 0, updated_at = ? WHERE id = ?").run(hash, now, user.id);
	db.prepare("DELETE FROM _hr_login_attempts WHERE key = ?").run(`email:${email}`);
	console.log(`Password set for ${email}. Sign in at <site>/admin with this email and password.`);
}
db.close();
