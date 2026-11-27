/** Browser side of passkeys: turns the server's JSON options into WebAuthn calls and back. */
const b64uToBuf = (s: string) => {
	const pad = "=".repeat((4 - (s.length % 4)) % 4);
	const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
};
const bufToB64u = (b: ArrayBuffer) =>
	btoa(String.fromCharCode(...new Uint8Array(b)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

async function post(url: string, body: unknown) {
	const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
	return data;
}

export async function loginWithPasskey(next: string) {
	if (!window.PublicKeyCredential) throw new Error("เบราว์เซอร์นี้ไม่รองรับ passkey");
	const opts = await post("/admin/api/passkey/login-options", {});
	const cred = (await navigator.credentials.get({
		publicKey: { challenge: b64uToBuf(opts.challenge), rpId: opts.rpId, timeout: opts.timeout, userVerification: opts.userVerification },
	})) as PublicKeyCredential | null;
	if (!cred) throw new Error("ยกเลิกแล้ว");
	const r = cred.response as AuthenticatorAssertionResponse;
	const out = await post("/admin/api/passkey/login", {
		next,
		response: {
			id: cred.id,
			response: { clientDataJSON: bufToB64u(r.clientDataJSON), authenticatorData: bufToB64u(r.authenticatorData), signature: bufToB64u(r.signature) },
		},
	});
	location.href = out.next || "/admin";
}

export async function registerPasskey(name: string) {
	if (!window.PublicKeyCredential) throw new Error("เบราว์เซอร์นี้ไม่รองรับ passkey");
	const o = await post("/admin/api/passkey/register-options", {});
	const cred = (await navigator.credentials.create({
		publicKey: {
			challenge: b64uToBuf(o.challenge),
			rp: o.rp,
			user: { id: b64uToBuf(o.user.id), name: o.user.name, displayName: o.user.displayName },
			pubKeyCredParams: o.pubKeyCredParams,
			timeout: o.timeout,
			attestation: o.attestation,
			authenticatorSelection: o.authenticatorSelection,
			excludeCredentials: o.excludeCredentials.map((c: { id: string; type: "public-key"; transports?: AuthenticatorTransport[] }) => ({ ...c, id: b64uToBuf(c.id) })),
		},
	})) as PublicKeyCredential | null;
	if (!cred) throw new Error("ยกเลิกแล้ว");
	const r = cred.response as AuthenticatorAttestationResponse;
	await post("/admin/api/passkey/register", {
		name,
		response: {
			id: cred.id,
			response: { clientDataJSON: bufToB64u(r.clientDataJSON), attestationObject: bufToB64u(r.attestationObject), transports: r.getTransports?.() ?? [] },
		},
	});
}
