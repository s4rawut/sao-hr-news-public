// Apply patches/*.sql to ./data.db once each (see patches/README.md). Run from the folder holding data.db.
// Usage: node apply-patches.mjs [patches-dir]
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const dir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "patches"));
if (!existsSync("data.db")) {
	console.error("apply-patches: no data.db in", process.cwd());
	process.exit(1);
}
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];
const db = new DatabaseSync("data.db");
db.exec("PRAGMA busy_timeout = 10000");
db.exec("CREATE TABLE IF NOT EXISTS _hr_patches (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
const done = new Set(db.prepare("SELECT name FROM _hr_patches").all().map((r) => r.name));
let applied = 0;
for (const f of files) {
	if (done.has(f)) continue;
	db.exec("BEGIN");
	try {
		db.exec(readFileSync(join(dir, f), "utf8"));
		db.prepare("INSERT INTO _hr_patches (name, applied_at) VALUES (?, ?)").run(f, new Date().toISOString());
		db.exec("COMMIT");
		console.log("apply-patches: applied", f);
		applied++;
	} catch (e) {
		db.exec("ROLLBACK");
		console.error("apply-patches: FAILED", f, "-", e.message);
		process.exit(1);
	}
}
console.log(`apply-patches: ${applied} new, ${done.size + applied} total`);
db.close();
