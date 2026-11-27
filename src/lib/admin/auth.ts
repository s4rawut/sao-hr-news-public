/**
 * Admin sign-in with email + password. Everything is in the database: password hashes (scrypt)
 * in users.password_hash, the cookie-signing secret in options, failed-attempt counters in
 * _hr_login_attempts. No password is stored in code or config.
 */
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AstroCookies } from "astro";
import { get, nowIso, run, ulid } from "../cms/db";

export const ROLES = { CONTRIBUTOR: 20, AUTHOR: 30, EDITOR: 40, ADMIN: 50 } as const;
export const ROLE_LABELS: Record<number, string> = {
	50: "ผู้ดูแลระบบ (แก้ได้ทุกอย่าง จัดการผู้ใช้ได้)",
	40: "บรรณาธิการ (แก้เนื้อหา สื่อ เมนู หมวดหมู่ได้ทั้งหมด)",
	30: "ผู้เขียน (เพิ่มและแก้เนื้อหาได้)",
	20: "ผู้ร่วมเขียน (แก้เนื้อหาเป็นฉบับร่าง)",
};
export const roleName = (role: number) =>
	role >= 50 ? "ผู้ดูแลระบบ" : role >= 40 ? "บรรณาธิการ" : role >= 30 ? "ผู้เขียน" : role >= 20 ? "ผู้ร่วมเขียน" : "ผู้อ่าน";

export interface AdminUser {
	id: string;
	email: string;
	name: string | null;
	role: number;
	disabled: number;
}

const SESSION_COOKIE = "hr_admin";
const SESSION_DAYS = 14;
const DEV_ACCOUNT = "dev@emdash.local";
export const MIN_PASSWORD = 8;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

/* ---------- passwords ---------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password: string): string {
	const salt = randomBytes(16);
	const hash = scryptSync(password.normalize("NFC"), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
	return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
	if (!stored) return false;
	const [kind, n, r, p, salt, hash] = stored.split("$");
	if (kind !== "scrypt" || !salt || !hash) return false;
	const expected = Buffer.from(hash, "base64");
	const actual = scryptSync(password.normalize("NFC"), Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Basic strength rule, shown in the forms. */
export function checkPassword(password: string): string | null {
	if (password.length < MIN_PASSWORD) return `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
	if (/^\d+$/.test(password) || /^(.)\1+$/.test(password)) return "รหัสผ่านเดาง่ายเกินไป (ใช้ตัวอักษรผสมตัวเลข)";
	return null;
}

export function setPassword(userId: string, password: string) {
	const problem = checkPassword(password);
	if (problem) throw new Error(problem);
	run(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, hashPassword(password), nowIso(), userId);
}

/* ---------- sign-in with lockout ---------- */

const attemptKey = (email: string) => `email:${email.trim().toLowerCase()}`;

export function signIn(email: string, password: string): { user: AdminUser } | { error: string } {
	const key = attemptKey(email);
	const a = get<{ failures: number; locked_until: string | null }>(`SELECT failures, locked_until FROM _hr_login_attempts WHERE key = ?`, key);
	if (a?.locked_until && Date.parse(a.locked_until) > Date.now()) {
		const mins = Math.ceil((Date.parse(a.locked_until) - Date.now()) / 60_000);
		return { error: `ใส่รหัสผิดหลายครั้ง บัญชีนี้ถูกล็อกชั่วคราว ลองใหม่ใน ${mins} นาที` };
	}
	const row = get<AdminUser & { password_hash: string | null }>(
		`SELECT id, email, name, role, disabled, password_hash FROM users WHERE lower(email) = lower(?)`,
		email.trim(),
	);
	// verify even when the user does not exist, so timing does not reveal which emails exist
	const ok = verifyPassword(password, row?.password_hash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==");
	if (!row || !ok || row.email === DEV_ACCOUNT) {
		const failures = (a?.failures ?? 0) + 1;
		const locked = failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
		run(
			`INSERT INTO _hr_login_attempts (key, failures, locked_until, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, updated_at = excluded.updated_at`,
			key,
			locked ? 0 : failures,
			locked,
			nowIso(),
		);
		return { error: locked ? `ใส่รหัสผิด ${MAX_FAILURES} ครั้ง ล็อกชั่วคราว ${LOCK_MINUTES} นาที` : "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
	}
	if (row.disabled) return { error: "บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ" };
	run(`DELETE FROM _hr_login_attempts WHERE key = ?`, key);
	const { password_hash: _, ...user } = row;
	return { user };
}

/* ---------- sessions (signed cookie; secret kept in the options table) ---------- */

function sessionSecret(): Buffer {
	const read = () => get<{ value: string }>(`SELECT value FROM options WHERE name = 'hr:session_secret'`);
	if (!read()) run(`INSERT OR IGNORE INTO options (name, value) VALUES ('hr:session_secret', ?)`, JSON.stringify(randomBytes(32).toString("base64")));
	return Buffer.from(JSON.parse(read()!.value), "base64");
}

const sign = (payload: string) => createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
/** Changes when the password changes, so old sessions end after a password change or reset. */
const passwordStamp = (hash: string | null) => createHash("sha256").update(hash ?? "none").digest("base64url").slice(0, 12);

export function createSession(cookies: AstroCookies, userId: string, secure: boolean) {
	const u = get<{ password_hash: string | null }>(`SELECT password_hash FROM users WHERE id = ?`, userId);
	const exp = Date.now() + SESSION_DAYS * 86_400_000;
	const payload = `${userId}.${exp}.${passwordStamp(u?.password_hash ?? null)}`;
	cookies.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, { path: "/", httpOnly: true, sameSite: "lax", secure, maxAge: SESSION_DAYS * 86_400 });
	run(`UPDATE users SET updated_at = ? WHERE id = ?`, nowIso(), userId);
}

export function clearSession(cookies: AstroCookies) {
	cookies.delete(SESSION_COOKIE, { path: "/" });
}

export function currentUser(cookies: AstroCookies): AdminUser | null {
	const raw = cookies.get(SESSION_COOKIE)?.value;
	if (!raw) return null;
	const parts = raw.split(".");
	if (parts.length !== 4) return null;
	const [userId, exp, stamp, mac] = parts;
	const expected = sign(`${userId}.${exp}.${stamp}`);
	if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
	if (Number(exp) < Date.now()) return null;
	const user = get<AdminUser & { password_hash: string | null }>(`SELECT id, email, name, role, disabled, password_hash FROM users WHERE id = ?`, userId);
	if (!user || user.disabled || user.email === DEV_ACCOUNT || user.role < ROLES.CONTRIBUTOR) return null;
	if (passwordStamp(user.password_hash) !== stamp) return null;
	const { password_hash: _, ...rest } = user;
	return rest;
}

export function createUser(email: string, name: string, role: number, password: string): string {
	const e = email.trim().toLowerCase();
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("อีเมลไม่ถูกต้อง");
	if (!ROLE_LABELS[role]) throw new Error("เลือกสิทธิ์");
	if (get(`SELECT 1 FROM users WHERE lower(email) = ?`, e)) throw new Error("มีผู้ใช้อีเมลนี้แล้ว");
	const problem = checkPassword(password);
	if (problem) throw new Error(problem);
	const id = ulid();
	run(
		`INSERT INTO users (id, email, name, role, email_verified, created_at, updated_at, disabled, password_hash) VALUES (?, ?, ?, ?, 1, ?, ?, 0, ?)`,
		id,
		e,
		name.trim() || null,
		role,
		nowIso(),
		nowIso(),
		hashPassword(password),
	);
	return id;
}

export function audit(actorId: string | null, action: string, resourceType?: string, resourceId?: string, details?: unknown) {
	try {
		run(
			`INSERT INTO audit_logs (id, timestamp, actor_id, action, resource_type, resource_id, details, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'success')`,
			ulid(),
			nowIso(),
			actorId,
			action,
			resourceType ?? null,
			resourceId ?? null,
			details === undefined ? null : JSON.stringify(details),
		);
	} catch {
		/* logging must never break the request */
	}
}
