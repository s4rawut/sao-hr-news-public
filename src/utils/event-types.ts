import { getEmDashCollection } from "../lib/cms";

/**
 * Event types and their calendar colours, from admin → "ประเภทกิจกรรม (สีในปฏิทิน)".
 * Each event picks a type by name ("ประเภทกิจกรรม (สีในปฏิทิน)" field); a name that is not in
 * the list, or no type, gets the fallback colour.
 */
export const eventFallbackColor = "#2bb3d6";
const HEX = /^#[0-9a-f]{6}$/i;

export async function getEventTypes() {
	const { entries, cacheHint } = await getEmDashCollection("event_types", { limit: 200 });
	const types = entries
		.map((e) => ({
			title: (e.data.title ?? "").trim(),
			color: HEX.test(e.data.color?.trim() ?? "") ? e.data.color!.trim() : eventFallbackColor,
			order: e.data.sort_order ?? 999,
		}))
		.filter((t) => t.title)
		.sort((a, b) => a.order - b.order);
	const byName = new Map(types.map((t) => [t.title, t.color]));
	const colorOf = (type?: string | null) => (type && byName.get(type.trim())) || eventFallbackColor;
	return { types, colorOf, cacheHint };
}

/** The event's type name: the new field, or the older fixed-list field for events not re-saved yet. */
export const eventTypeName = (data: { type_name?: string | null; event_type?: string | null }) =>
	data.type_name?.trim() || data.event_type?.trim() || undefined;
