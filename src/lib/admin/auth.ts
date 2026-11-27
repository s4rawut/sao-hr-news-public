/**
 * Admin sign-in: passkeys (WebAuthn), one-time sign-in / invite links, and session cookies.
 * Uses the users / credentials / auth_tokens / auth_challenges tables EmDash created, so
 * existing accounts and passkeys keep working.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AstroCookies } from "astro";
import { ECDSAPublicKey, decodePKIXECDSASignature, decodeSEC1PublicKey, p256, verifyECDSASignature } from "@oslojs/crypto/ecdsa";
import { RSAPublicKey, decodePKIXRSAPublicKey, sha256ObjectIdentifier, verifyRSASSAPKCS1v15Signature } from "@oslojs/crypto/rsa";
import { sha256 } from "@oslojs/crypto/sha2";
import { decodeBase64urlIgnorePadding, encodeBase64urlNoPadding } from "@oslojs/encoding";
import {
	COSEKeyType,
	ClientDataType,
	coseAlgorithmES256,
	coseAlgorithmRS256,
	coseEllipticCurveP256,
	createAssertionSignatureMessage,
	parseAttestationObject,
	parseAuthenticatorData,
	parseClientDataJSON,
} from "@oslojs/webauthn";
import { all, get, nowIso, run, ulid } from "../cms/db";

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

/** Secret for signing session cookies: kept in the options table, made once. */
function sessionSecret(): Buffer {
	const row = get<{ value: string }>(`SELECT value FROM options WHERE name = 'hr:session_secret'`);
	if (row) return Buffer.from(JSON.parse(row.value), "base64");
	const secret = randomBytes(32).toString("base64");
	run(`INSERT OR IGNORE INTO options (name, value) VALUES ('hr:session_secret', ?)`, JSON.stringify(secret));
	return Buffer.from(JSON.parse(get<{ value: string }>(`SELECT value FROM options WHERE name = 'hr:session_secret'`)!.value), "base64");
}

const sign = (payload: string) => createHmac("sha256", sessionSecret()).update(payload).digest("base64url");

export function createSession(cookies: AstroCookies, userId: string, secure: boolean) {
	const exp = Date.now() + SESSION_DAYS * 86_400_000;
	const payload = `${userId}.${exp}`;
	cookies.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		secure,
		maxAge: SESSION_DAYS * 86_400,
	});
	run(`UPDATE users SET updated_at = ? WHERE id = ?`, nowIso(), userId);
}

export function clearSession(cookies: AstroCookies) {
	cookies.delete(SESSION_COOKIE, { path: "/" });
}

export function currentUser(cookies: AstroCookies): AdminUser | null {
	const raw = cookies.get(SESSION_COOKIE)?.value;
	if (!raw) return null;
	const parts = raw.split(".");
	if (parts.length !== 3) return null;
	const [userId, exp, mac] = parts;
	const expected = sign(`${userId}.${exp}`);
	if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
	if (Number(exp) < Date.now()) return null;
	const user = get<AdminUser>(`SELECT id, email, name, role, disabled FROM users WHERE id = ?`, userId);
	if (!user || user.disabled || user.email === DEV_ACCOUNT || user.role < ROLES.CONTRIBUTOR) return null;
	return user;
}

/* ---------- one-time tokens (sign-in links, invites) ---------- */

export function newToken(): { token: string; hash: string } {
	const bytes = randomBytes(32);
	return { token: encodeBase64urlNoPadding(bytes), hash: encodeBase64urlNoPadding(sha256(bytes)) };
}

export function hashToken(token: string): string {
	let bytes: Uint8Array;
	try {
		bytes = decodeBase64urlIgnorePadding(token);
	} catch {
		bytes = new TextEncoder().encode(token);
	}
	return encodeBase64urlNoPadding(sha256(bytes));
}

/** A sign-in link for an existing user (15 minutes, works once). */
export function createSignInToken(userId: string, email: string, minutes = 15): string {
	const { token, hash } = newToken();
	run(
		`INSERT INTO auth_tokens (hash, user_id, email, type, role, invited_by, expires_at, created_at) VALUES (?, ?, ?, 'magic_link', NULL, NULL, ?, ?)`,
		hash,
		userId,
		email,
		new Date(Date.now() + minutes * 60_000).toISOString(),
		nowIso(),
	);
	return token;
}

/** An invite for a new person (7 days): opening it creates their account with this role. */
export function createInviteToken(email: string, role: number, invitedBy: string, days = 7): string {
	const { token, hash } = newToken();
	run(`DELETE FROM auth_tokens WHERE type = 'invite' AND lower(email) = lower(?)`, email);
	run(
		`INSERT INTO auth_tokens (hash, user_id, email, type, role, invited_by, expires_at, created_at) VALUES (?, NULL, ?, 'invite', ?, ?, ?, ?)`,
		hash,
		email,
		role,
		invitedBy,
		new Date(Date.now() + days * 86_400_000).toISOString(),
		nowIso(),
	);
	return token;
}

/** Use a sign-in link or invite: returns the user to sign in, or an error message. */
export function consumeToken(token: string, name?: string): { user: AdminUser } | { error: string } {
	const hash = hashToken(token);
	const row = get<{ hash: string; user_id: string | null; email: string; type: string; role: number | null; expires_at: string }>(
		`SELECT hash, user_id, email, type, role, expires_at FROM auth_tokens WHERE hash = ?`,
		hash,
	);
	if (!row) return { error: "ลิงก์นี้ใช้ไปแล้วหรือไม่ถูกต้อง" };
	if (Date.parse(row.expires_at) < Date.now()) {
		run(`DELETE FROM auth_tokens WHERE hash = ?`, hash);
		return { error: "ลิงก์หมดอายุแล้ว" };
	}
	if (row.type === "magic_link" || row.type === "recovery") {
		run(`DELETE FROM auth_tokens WHERE hash = ?`, hash);
		const user = get<AdminUser>(`SELECT id, email, name, role, disabled FROM users WHERE id = ?`, row.user_id);
		if (!user || user.disabled) return { error: "บัญชีนี้ถูกปิดใช้งาน" };
		return { user };
	}
	if (row.type === "invite") {
		let user = get<AdminUser>(`SELECT id, email, name, role, disabled FROM users WHERE lower(email) = lower(?)`, row.email);
		if (!user) {
			const id = ulid();
			run(
				`INSERT INTO users (id, email, name, role, email_verified, created_at, updated_at, disabled) VALUES (?, ?, ?, ?, 1, ?, ?, 0)`,
				id,
				row.email.toLowerCase(),
				name?.trim() || null,
				row.role ?? ROLES.EDITOR,
				nowIso(),
				nowIso(),
			);
			user = get<AdminUser>(`SELECT id, email, name, role, disabled FROM users WHERE id = ?`, id)!;
		} else if (user.disabled) return { error: "บัญชีนี้ถูกปิดใช้งาน" };
		run(`DELETE FROM auth_tokens WHERE hash = ?`, hash);
		return { user };
	}
	return { error: "ลิงก์ไม่ถูกต้อง" };
}

export function peekInvite(token: string) {
	return get<{ email: string; role: number; expires_at: string }>(
		`SELECT email, role, expires_at FROM auth_tokens WHERE hash = ? AND type = 'invite'`,
		hashToken(token),
	);
}

/* ---------- passkeys ---------- */

export interface RelyingParty {
	rpId: string;
	origin: string;
}

/** The site's address for passkeys: EMDASH_SITE_URL if set, otherwise the address that was opened. */
export function relyingParty(url: URL): RelyingParty {
	const fixed = process.env.EMDASH_SITE_URL || process.env.SITE_URL;
	if (fixed && URL.canParse(fixed)) {
		const u = new URL(fixed);
		return { rpId: u.hostname, origin: u.origin };
	}
	return { rpId: url.hostname, origin: url.origin };
}

function storeChallenge(type: "registration" | "authentication", userId: string | null): string {
	const challenge = encodeBase64urlNoPadding(randomBytes(32));
	run(`DELETE FROM auth_challenges WHERE expires_at < ?`, nowIso());
	run(
		`INSERT INTO auth_challenges (challenge, type, user_id, data, expires_at, created_at) VALUES (?, ?, ?, NULL, ?, ?)`,
		challenge,
		type,
		userId,
		new Date(Date.now() + 5 * 60_000).toISOString(),
		nowIso(),
	);
	return challenge;
}

function takeChallenge(challenge: string, type: string) {
	const row = get<{ type: string; user_id: string | null; expires_at: string }>(
		`SELECT type, user_id, expires_at FROM auth_challenges WHERE challenge = ?`,
		challenge,
	);
	run(`DELETE FROM auth_challenges WHERE challenge = ?`, challenge);
	if (!row || row.type !== type || Date.parse(row.expires_at) < Date.now()) throw new Error("หมดเวลา กรุณาลองใหม่");
	return row;
}

export function passkeyLoginOptions(rp: RelyingParty) {
	return {
		challenge: storeChallenge("authentication", null),
		rpId: rp.rpId,
		timeout: 60000,
		userVerification: "preferred",
	};
}

interface AssertionJSON {
	id: string;
	response: { clientDataJSON: string; authenticatorData: string; signature: string };
}

export function verifyPasskeyLogin(rp: RelyingParty, response: AssertionJSON): AdminUser {
	const cred = get<{ id: string; user_id: string; public_key: Uint8Array; counter: number; algorithm: number }>(
		`SELECT id, user_id, public_key, counter, algorithm FROM credentials WHERE id = ?`,
		response.id,
	);
	if (!cred) throw new Error("ไม่พบ passkey นี้ในระบบ (อาจลงทะเบียนไว้กับที่อยู่เว็บอื่น)");
	const clientDataJSON = decodeBase64urlIgnorePadding(response.response.clientDataJSON);
	const authenticatorData = decodeBase64urlIgnorePadding(response.response.authenticatorData);
	const signature = decodeBase64urlIgnorePadding(response.response.signature);
	const clientData = parseClientDataJSON(clientDataJSON);
	if (clientData.type !== ClientDataType.Get) throw new Error("ข้อมูลไม่ถูกต้อง");
	takeChallenge(encodeBase64urlNoPadding(clientData.challenge), "authentication");
	if (clientData.origin !== rp.origin) throw new Error(`ที่อยู่เว็บไม่ตรง (${clientData.origin})`);
	const authData = parseAuthenticatorData(authenticatorData);
	if (!authData.verifyRelyingPartyIdHash(rp.rpId)) throw new Error("passkey นี้ไม่ได้ลงทะเบียนกับที่อยู่เว็บนี้");
	if (!authData.userPresent) throw new Error("ยืนยันตัวตนไม่สำเร็จ");
	if ((authData.signatureCounter !== 0 || cred.counter !== 0) && authData.signatureCounter <= cred.counter) {
		throw new Error("passkey ไม่ถูกต้อง");
	}
	const hash = sha256(createAssertionSignatureMessage(authenticatorData, clientDataJSON));
	const key = new Uint8Array(cred.public_key);
	let ok = false;
	if (cred.algorithm === coseAlgorithmES256) {
		ok = verifyECDSASignature(decodeSEC1PublicKey(p256, key), hash, decodePKIXECDSASignature(signature));
	} else if (cred.algorithm === coseAlgorithmRS256) {
		ok = verifyRSASSAPKCS1v15Signature(decodePKIXRSAPublicKey(key), sha256ObjectIdentifier, hash, signature);
	}
	if (!ok) throw new Error("ลายเซ็นไม่ถูกต้อง");
	run(`UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?`, authData.signatureCounter, nowIso(), cred.id);
	const user = get<AdminUser>(`SELECT id, email, name, role, disabled FROM users WHERE id = ?`, cred.user_id);
	if (!user || user.disabled) throw new Error("บัญชีนี้ถูกปิดใช้งาน");
	return user;
}

export function passkeyRegisterOptions(rp: RelyingParty, user: AdminUser, siteName: string) {
	const existing = all<{ id: string; transports: string | null }>(`SELECT id, transports FROM credentials WHERE user_id = ?`, user.id);
	return {
		challenge: storeChallenge("registration", user.id),
		rp: { name: siteName, id: rp.rpId },
		user: { id: encodeBase64urlNoPadding(new TextEncoder().encode(user.id)), name: user.email, displayName: user.name || user.email },
		pubKeyCredParams: [
			{ type: "public-key", alg: coseAlgorithmES256 },
			{ type: "public-key", alg: coseAlgorithmRS256 },
		],
		timeout: 60000,
		attestation: "none",
		authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
		excludeCredentials: existing.map((c) => ({
			type: "public-key",
			id: c.id,
			transports: c.transports ? (JSON.parse(c.transports) as string[]) : undefined,
		})),
	};
}

interface AttestationJSON {
	id: string;
	response: { clientDataJSON: string; attestationObject: string; transports?: string[] };
}

export function verifyPasskeyRegistration(rp: RelyingParty, user: AdminUser, response: AttestationJSON, name: string) {
	const clientDataJSON = decodeBase64urlIgnorePadding(response.response.clientDataJSON);
	const clientData = parseClientDataJSON(clientDataJSON);
	if (clientData.type !== ClientDataType.Create) throw new Error("ข้อมูลไม่ถูกต้อง");
	const ch = takeChallenge(encodeBase64urlNoPadding(clientData.challenge), "registration");
	if (ch.user_id !== user.id) throw new Error("ข้อมูลไม่ถูกต้อง");
	if (clientData.origin !== rp.origin) throw new Error(`ที่อยู่เว็บไม่ตรง (${clientData.origin})`);
	const attestation = parseAttestationObject(decodeBase64urlIgnorePadding(response.response.attestationObject));
	const { authenticatorData } = attestation;
	if (!authenticatorData.verifyRelyingPartyIdHash(rp.rpId)) throw new Error("ที่อยู่เว็บไม่ตรง");
	if (!authenticatorData.userPresent || !authenticatorData.credential) throw new Error("ลงทะเบียนไม่สำเร็จ");
	const { credential } = authenticatorData;
	const algorithm = credential.publicKey.algorithm();
	let publicKey: Uint8Array;
	if (algorithm === coseAlgorithmES256 && credential.publicKey.type() === COSEKeyType.EC2) {
		const k = credential.publicKey.ec2();
		if (k.curve !== coseEllipticCurveP256) throw new Error("ไม่รองรับ passkey ชนิดนี้");
		publicKey = new ECDSAPublicKey(p256, k.x, k.y).encodeSEC1Uncompressed();
	} else if (algorithm === coseAlgorithmRS256 && credential.publicKey.type() === COSEKeyType.RSA) {
		const k = credential.publicKey.rsa();
		publicKey = new RSAPublicKey(k.n, k.e).encodePKIX();
	} else throw new Error("ไม่รองรับ passkey ชนิดนี้");
	run(
		`INSERT INTO credentials (id, user_id, public_key, counter, device_type, backed_up, transports, name, created_at, last_used_at, algorithm)
		 VALUES (?, ?, ?, ?, 'singleDevice', 0, ?, ?, ?, ?, ?)`,
		response.id,
		user.id,
		publicKey,
		authenticatorData.signatureCounter,
		JSON.stringify(response.response.transports ?? []),
		name.trim() || "Passkey",
		nowIso(),
		nowIso(),
		algorithm,
	);
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

/** sha256 hex, for small fingerprints */
export const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
