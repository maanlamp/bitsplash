import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileStory } from "../src/engine/ink/story";
import { PICKUP_TYPES } from "../src/game/pickup/pickup-component";

const MAIN = "main.ink";
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KNOT_DECL =
	/^\s*={2,}\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)/;

const DIALOGUE_DIR = fileURLToPath(
	new URL("../src/game/content/dialogue/", import.meta.url),
);
const OUT_FILE = join(DIALOGUE_DIR, "knots.gen.ts");
const RESERVED_MEMBERS = new Set(["root", "line"]);

type Container = {
	name: string | null;
	namedContent: Map<string, unknown>;
};

type KnotInfo = {
	name: string;
	file: string;
	stitches: string[];
};

const inkFiles = (dir: string): string[] => {
	const out: string[] = [];
	for (const entry of readdirSync(dir, {
		withFileTypes: true,
		recursive: true,
	})) {
		if (entry.isFile() && entry.name.endsWith(".ink")) {
			out.push(join(entry.parentPath, entry.name));
		}
	}
	return out;
};

const readSources = (
	files: string[],
): {
	sources: Record<string, string>;
	byFile: Map<string, string>;
} => {
	const sources: Record<string, string> = {};
	const byFile = new Map<string, string>();
	for (const path of files) {
		const name = basename(path);
		const text = readFileSync(path, "utf8");
		sources[name] = text;
		byFile.set(name, text);
	}
	return { sources, byFile };
};

const detectCollisions = (
	byFile: Map<string, string>,
): Map<string, string> => {
	const owner = new Map<string, string>();
	for (const [file, text] of byFile) {
		for (const line of text.split(/\r?\n/)) {
			const match = KNOT_DECL.exec(line);
			if (!match) {
				continue;
			}
			const knot = match[1]!;
			const existing = owner.get(knot);
			if (existing && existing !== file) {
				throw new Error(
					`Ink knot collision: "${knot}" is declared in both ${existing} and ${file}. Ink knot names share one global namespace and must be unique across files.`,
				);
			}
			owner.set(knot, file);
		}
	}
	return owner;
};

const walkKnots = (
	container: Container,
	owner: Map<string, string>,
): KnotInfo[] => {
	const knots: KnotInfo[] = [];
	for (const [name, value] of container.namedContent) {
		if (!IDENT.test(name)) {
			continue;
		}
		const knot = value as Container;
		const stitches: string[] = [];
		for (const stitch of knot.namedContent?.keys() ?? []) {
			if (IDENT.test(stitch)) {
				stitches.push(stitch);
			}
		}
		knots.push({ name, file: owner.get(name) ?? "", stitches });
	}
	return knots;
};

const pascalCase = (snake: string): string =>
	snake
		.split("_")
		.filter((part) => part.length > 0)
		.map((part) => part[0]!.toUpperCase() + part.slice(1))
		.join("");

const lineStitch = (type: string): string =>
	`pt_line_${type.replaceAll("-", "_")}`;

const emitNamespace = (knot: KnotInfo): string => {
	for (const stitch of knot.stitches) {
		if (RESERVED_MEMBERS.has(stitch)) {
			throw new Error(
				`Ink stitch "${knot.name}.${stitch}" collides with a reserved generated member name (${[...RESERVED_MEMBERS].join(", ")}).`,
			);
		}
	}
	const ns = pascalCase(knot.name);
	const lines: string[] = [`export namespace ${ns} {`];
	lines.push(
		`\texport const root: Knot = asKnot(${JSON.stringify(knot.name)});`,
	);
	for (const stitch of knot.stitches) {
		const path = `${knot.name}.${stitch}`;
		lines.push(
			`\texport const ${stitch}: Knot = asKnot(${JSON.stringify(path)});`,
		);
	}
	if (knot.name === "pickup_tutor") {
		const present = new Set(knot.stitches);
		const entries: string[] = [];
		for (const type of PICKUP_TYPES) {
			const stitch = lineStitch(type);
			if (!present.has(stitch)) {
				throw new Error(
					`Expected pickup-tutor stitch "${knot.name}.${stitch}" for pickup type "${type}" but it was not found.`,
				);
			}
			entries.push(
				`\t\t${JSON.stringify(type)}: asKnot(${JSON.stringify(`${knot.name}.${stitch}`)}),`,
			);
		}
		lines.push(`\texport const line: Record<PickupType, Knot> = {`);
		lines.push(...entries);
		lines.push(`\t};`);
	}
	lines.push(`}`);
	return lines.join("\n");
};

const render = (knots: KnotInfo[]): string => {
	const usesPickup = knots.some(
		(knot) => knot.name === "pickup_tutor",
	);
	const header = [
		"// GENERATED FILE - DO NOT EDIT.",
		"// Produced by scripts/gen-ink.ts from src/game/content/dialogue/*.ink.",
		"// Run `bun run gen` to regenerate.",
		"",
		'import { asKnot, type Knot } from "../../../engine/ink/knot";',
	];
	if (usesPickup) {
		header.push(
			'import type { PickupType } from "../../pickup/pickup-component";',
		);
	}
	header.push("");
	const body = knots.map(emitNamespace).join("\n\n");
	return `${header.join("\n")}\n${body}\n`;
};

export const generate = (): {
	outFile: string;
	knots: KnotInfo[];
} => {
	const files = inkFiles(DIALOGUE_DIR);
	const { sources, byFile } = readSources(files);
	if (!sources[MAIN]) {
		throw new Error(`Expected ${MAIN} in ${DIALOGUE_DIR}`);
	}
	const owner = detectCollisions(byFile);
	const story = compileStory(sources, MAIN);
	const container =
		story.mainContentContainer as unknown as Container;
	const knots = walkKnots(container, owner);
	writeFileSync(OUT_FILE, render(knots), "utf8");
	return { outFile: OUT_FILE, knots };
};

const result = generate();
console.log(`Generated ${result.outFile}`);
for (const knot of result.knots) {
	const label = knot.file ? ` (${knot.file})` : "";
	console.log(
		`  ${knot.name}${label}: ${knot.stitches.join(", ") || "(no stitches)"}`,
	);
}
