/**
 * The site's own database access (replaces EmDash). It opens the same SQLite file and the same
 * tables EmDash created, so existing data — including IT's live data — works without migration.
 *
 * The app runs with its working directory at the data folder (the container's /data volume, or
 * the project folder locally), so ./data.db and ./uploads are relative to process.cwd().
 */
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import path from "node:path";

let db: DatabaseSync | undefined;

export const DATA_DIR = process.cwd();
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export function getDb(): DatabaseSync {
	if (!db) {
		db = new DatabaseSync(path.join(DATA_DIR, "data.db"));
		db.exec("PRAGMA journal_mode = WAL");
		db.exec("PRAGMA busy_timeout = 10000");
		db.exec("PRAGMA foreign_keys = ON");
	}
	return db;
}

export type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
	return getDb().prepare(sql).all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
	return getDb().prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, ...params: unknown[]) {
	return getDb().prepare(sql).run(...(params as never[]));
}

/** Run fn inside one transaction (all or nothing). */
export function tx<T>(fn: () => T): T {
	const d = getDb();
	d.exec("BEGIN IMMEDIATE");
	try {
		const result = fn();
		d.exec("COMMIT");
		return result;
	} catch (err) {
		d.exec("ROLLBACK");
		throw err;
	}
}

/** Table names come from the schema tables; only allow plain identifiers. */
export function ident(name: string): string {
	if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`bad identifier: ${name}`);
	return `"${name}"`;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID (time-ordered id), the same id format EmDash used. */
export function ulid(now = Date.now()): string {
	let time = "";
	let t = now;
	for (let i = 0; i < 10; i++) {
		time = CROCKFORD[t % 32] + time;
		t = Math.floor(t / 32);
	}
	const bytes = randomBytes(16);
	let rand = "";
	for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i] % 32];
	return time + rand;
}

export const nowIso = () => new Date().toISOString();

/**
 * Bumped on every admin write, so in-process caches (schema, menus …) know to reload.
 */
let version = 0;
export const dataVersion = () => version;
export const touch = () => {
	version++;
};
