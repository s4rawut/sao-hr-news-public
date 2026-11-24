import { fileURLToPath } from "node:url";
import type { PluginDescriptor } from "emdash";

/**
 * Thai date picker for the admin: date-only fields shown as "15 พฤศจิกายน 2569".
 * A field uses it with widget "thai-date:date". Values are stored as midnight UTC of the
 * chosen day (the site's wall-clock-as-UTC convention, read back by adminDateTime).
 */
export function thaiDatePlugin(): PluginDescriptor {
	return {
		id: "thai-date",
		version: "1.0.0",
		format: "native",
		entrypoint: fileURLToPath(new URL("./plugin.ts", import.meta.url)),
		adminEntry: fileURLToPath(new URL("./admin.tsx", import.meta.url)),
		fieldWidgets: [
			{ name: "date", label: "วันที่ (ภาษาไทย)", fieldTypes: ["datetime"] },
			// dropdown of the entries in "ประเภทกิจกรรม (สีในปฏิทิน)", with their colours
			{ name: "eventtype", label: "ประเภทกิจกรรม", fieldTypes: ["string"] },
			// colour picker + hex box
			{ name: "color", label: "เลือกสี", fieldTypes: ["string"] },
		],
	};
}
