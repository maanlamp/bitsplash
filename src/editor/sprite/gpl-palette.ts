import { type PaletteColor, paletteColor } from "./palette-color";

/**
 * A parsed GIMP palette: its display name and its ordered colours. The name is
 * carried so a round-trip (parse → serialize) preserves the `Name:` header.
 */
export type GplPalette = Readonly<{
	name: string;
	colors: ReadonlyArray<PaletteColor>;
}>;

const DEFAULT_NAME = "Untitled";

/**
 * Parse a GIMP palette (`.gpl`) file.
 *
 * Format: a `GIMP Palette` magic line, optional `Name:`/`Columns:` headers,
 * optional `#` comment lines, then one colour per line as `R G B` (0–255,
 * whitespace-separated) with an optional trailing name. Lines that do not start
 * with three integers are ignored, so headers and comments are skipped
 * leniently. Throws when the magic line is absent (not a `.gpl`).
 *
 * @example
 * parseGpl("GIMP Palette\nName: Foo\n255 0 0\tRed\n");
 * // { name: "Foo", colors: [{ r: 255, g: 0, b: 0 }] }
 */
export const parseGpl = (text: string): GplPalette => {
	const lines = text.split(/\r?\n/);
	if (!(lines[0] ?? "").trim().startsWith("GIMP Palette")) {
		throw new Error(
			"Not a GIMP palette (.gpl): missing magic header.",
		);
	}
	let name = DEFAULT_NAME;
	const colors: PaletteColor[] = [];
	for (const line of lines.slice(1)) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) {
			continue;
		}
		const nameMatch = trimmed.match(/^Name:\s*(.*)$/i);
		if (nameMatch) {
			name = nameMatch[1]!.trim() || DEFAULT_NAME;
			continue;
		}
		const rgb = trimmed.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b/);
		if (rgb) {
			colors.push(
				paletteColor(Number(rgb[1]), Number(rgb[2]), Number(rgb[3])),
			);
		}
	}
	return { name, colors };
};

const channel = (value: number): string =>
	String(value).padStart(3, " ");

/**
 * Serialize colours to GIMP palette (`.gpl`) text: the `GIMP Palette` magic
 * line, a `Name:` header, then one `R G B\tName` line per colour (channels
 * right-padded to 3 columns, the conventional GIMP layout). Round-trips with
 * {@link parseGpl}.
 */
export const serializeGpl = (
	colors: ReadonlyArray<PaletteColor>,
	name = DEFAULT_NAME,
): string => {
	const lines = ["GIMP Palette", `Name: ${name}`, "Columns: 0", "#"];
	colors.forEach((color, index) => {
		lines.push(
			`${channel(color.r)} ${channel(color.g)} ${channel(color.b)}\tColor ${index + 1}`,
		);
	});
	return `${lines.join("\n")}\n`;
};
