import { mediaUrl } from "./site-info";
import { bangkokParts, thaiMonths } from "./thai-date";

export type VideoSource =
	| { kind: "file"; src: string }
	| { kind: "embed"; src: string; provider: "youtube" | "facebook" | "vimeo"; thumbnail?: string }
	| { kind: "link"; src: string };

interface VideoData {
	video_file?: { src?: string; url?: string; meta?: Record<string, unknown> };
	video_url?: string;
}

function youTubeId(url: URL) {
	const host = url.hostname.replace(/^www\.|^m\./, "");
	if (host === "youtu.be") return url.pathname.slice(1).split("/")[0];
	if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
		const v = url.searchParams.get("v");
		if (v) return v;
		const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/);
		if (m) return m[1];
	}
	return undefined;
}

/** Works out how to play a video: the uploaded file wins, then the link. */
export function resolveVideo(data: VideoData): VideoSource | undefined {
	const file = mediaUrl(data.video_file);
	if (file) return { kind: "file", src: file };

	const raw = data.video_url?.trim();
	if (!raw) return undefined;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return undefined;
	}

	const yt = youTubeId(url);
	if (yt) {
		return {
			kind: "embed",
			provider: "youtube",
			src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}?rel=0`,
			thumbnail: `https://i.ytimg.com/vi/${encodeURIComponent(yt)}/hqdefault.jpg`,
		};
	}

	const host = url.hostname.replace(/^www\.|^m\./, "");
	if (host.endsWith("facebook.com") || host === "fb.watch") {
		return {
			kind: "embed",
			provider: "facebook",
			src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(raw)}&show_text=false`,
		};
	}

	const vimeo = host.endsWith("vimeo.com") && url.pathname.match(/(\d{6,})/);
	if (vimeo) {
		return { kind: "embed", provider: "vimeo", src: `https://player.vimeo.com/video/${vimeo[1]}` };
	}

	if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(url.pathname)) return { kind: "file", src: raw };

	return { kind: "link", src: raw };
}

/** "ตุลาคม 2569" */
export function formatThaiMonth(date: Date) {
	const { year, month } = bangkokParts(date);
	return `${thaiMonths[month]} ${year + 543}`;
}
