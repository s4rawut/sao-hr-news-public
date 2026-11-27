// Loaded before the server in the container (node --import). Makes the site use the domain people
// actually opened, so changing the domain needs no setting:
//  - a request for a real domain (Host or X-Forwarded-Host) with no X-Forwarded-Proto is taken as
//    https, because the reverse proxy in front does HTTPS (secure admin cookies need https)
//  - a request that reaches the server as localhost / an IP (the proxy did not pass the domain on)
//    uses FALLBACK_SITE_URL, if set
// Astro then only trusts domains listed in astro.config.mjs security.allowedDomains.
// EMDASH_SITE_URL, when set, still wins over all of this.
import http from "node:http";

const fallback = URL.canParse(process.env.FALLBACK_SITE_URL || "") ? new URL(process.env.FALLBACK_SITE_URL) : null;
const first = (v) => v?.toString().split(",")[0].trim() || undefined;
const isLocalOrIp = (host) => {
	if (!host) return true;
	const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
	return name === "localhost" || /^[\d.]+$/.test(name) || name.includes(":");
};

const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, req, ...rest) {
	if (event === "request" && req?.headers) {
		const h = req.headers;
		const host = first(h["x-forwarded-host"]) || h.host;
		if (!isLocalOrIp(host)) {
			if (!h["x-forwarded-proto"]) h["x-forwarded-proto"] = "https";
		} else if (fallback) {
			h["x-forwarded-host"] = fallback.host;
			h["x-forwarded-proto"] = fallback.protocol.replace(":", "");
		}
	}
	return emit.call(this, event, req, ...rest);
};
