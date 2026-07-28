import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Story } from "inkjs/full";
import { compileStory } from "../src/engine/ink/story";
import {
	CHARACTER_IDS,
	isCharacterId,
} from "../src/game/character/character-ids";
import {
	EMOTION_IDS,
	isEmotionId,
} from "../src/game/character/emotion-ids";
import {
	DIALOGUE_FLAG_TAGS,
	isDialogueFlagTag,
} from "../src/game/dialogue/dialogue-flag-tags";
import { PICKUP_TYPES } from "../src/game/pickup/pickup-component";
import { REACTION_IDS } from "../src/game/reaction/reaction-ids";

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

/**
 * "This knot must carry one stitch per member of a const tuple, exposed as a
 * generated `Record` member."
 *
 * Adding a rule is the whole extension point: a new row makes `bun run gen`
 * throw when a stitch is missing and emits a `Record` whose key type is checked
 * by `tsc` at every call site. `member` must be in {@link RESERVED_MEMBERS} so an
 * authored stitch can never shadow it.
 */
type StitchPerMemberRule = Readonly<{
	knot: string;
	members: readonly string[];
	stitchFor: (member: string) => string;
	member: string;
	valueType: string;
	imports: readonly string[];
}>;

const STITCH_PER_MEMBER_RULES: readonly StitchPerMemberRule[] = [
	{
		knot: "pickup_tutor",
		members: PICKUP_TYPES,
		stitchFor: (type) => `pt_line_${type.replaceAll("-", "_")}`,
		member: "line",
		valueType: "Record<PickupType, Knot>",
		imports: [
			'import type { PickupType } from "../../pickup/pickup-component";',
		],
	},
	{
		knot: "reactions",
		members: REACTION_IDS,
		stitchFor: (id) => `rx_${id.replaceAll("-", "_")}`,
		member: "line",
		valueType: "Record<ReactionId, Knot>",
		imports: [
			'import type { ReactionId } from "../../reaction/reaction-ids";',
		],
	},
];

for (const rule of STITCH_PER_MEMBER_RULES) {
	if (!RESERVED_MEMBERS.has(rule.member)) {
		throw new Error(
			`Stitch-per-member rule for knot "${rule.knot}" emits member "${rule.member}", which is not reserved. Add it to RESERVED_MEMBERS so an authored stitch cannot shadow it.`,
		);
	}
}

const TAG_BEGIN = "#";
const TAG_END = "/#";
const TAG_TEXT = "^";

/** The one tag key every text-emitting knot is required to carry. */
const SPEAKER_KEY = "speaker";

/** Tag keys whose value must be a member of a shared const tuple. */
const VALIDATED_TAG_KEYS: Readonly<
	Record<
		string,
		{
			readonly ids: readonly string[];
			readonly has: (value: string) => boolean;
		}
	>
> = {
	[SPEAKER_KEY]: { ids: CHARACTER_IDS, has: isCharacterId },
	emotion: { ids: EMOTION_IDS, has: isEmotionId },
};

/** Tag keys that were once authored and now mean nothing. */
const RETIRED_TAG_KEYS: Readonly<Record<string, string>> = {
	font: "font comes from the character descriptor, not from a tag",
};

type TagSite = Readonly<{
	knot: string;
	stitch: string | null;
	file: string;
}>;

type TagRun = { text: string; dynamic: boolean };

const TOP_LEVEL = "(top level)";

const siteLabel = (site: TagSite): string => {
	const path = site.stitch
		? `${site.knot}.${site.stitch}`
		: site.knot;
	return site.file ? `${path} (${site.file})` : path;
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

const compiledRoot = (story: Story): unknown[] => {
	const json = story.ToJson();
	if (typeof json !== "string") {
		throw new Error("Story.ToJson() returned no JSON.");
	}
	const parsed: unknown = JSON.parse(json);
	const root =
		parsed && typeof parsed === "object"
			? (parsed as { root?: unknown }).root
			: undefined;
	if (!Array.isArray(root)) {
		throw new Error(
			"Compiled ink JSON has no root container array; inkjs output shape changed.",
		);
	}
	return root;
};

/** Named sub-containers of a compiled container, in authored order. */
const namedChildren = (
	content: readonly unknown[],
): [string, unknown[]][] => {
	const out: [string, unknown[]][] = [];
	for (const item of content) {
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			continue;
		}
		for (const [name, value] of Object.entries(item)) {
			if (Array.isArray(value)) {
				out.push([name, value]);
			}
		}
	}
	return out;
};

const checkTag = (site: TagSite, run: TagRun): void => {
	const text = run.text.trim();
	if (run.dynamic) {
		throw new Error(
			`Ink tag "# ${text}" in ${siteLabel(site)} interpolates a value. Tags must be static literals so gen-ink can validate them at build; write the id out in full, or branch on the variable in ink and tag each branch.`,
		);
	}
	const colon = text.indexOf(":");
	if (colon < 0) {
		if (!isDialogueFlagTag(text)) {
			throw new Error(
				`Ink tag "# ${text}" in ${siteLabel(site)} carries no value and is not a known flag tag. A misspelled flag tag would silently do nothing, so the vocabulary is closed. Known flag tags: ${DIALOGUE_FLAG_TAGS.join(", ")}. For a "key: value" tag, write the colon.`,
			);
		}
		return;
	}
	const key = text.slice(0, colon).trim();
	const value = text.slice(colon + 1).trim();
	const retired = RETIRED_TAG_KEYS[key];
	if (retired) {
		throw new Error(
			`Ink tag "# ${text}" in ${siteLabel(site)} uses the retired "${key}:" tag — ${retired}. Remove it.`,
		);
	}
	const validated = VALIDATED_TAG_KEYS[key];
	if (validated && !validated.has(value)) {
		throw new Error(
			`Ink tag "# ${text}" in ${siteLabel(site)} is not a known ${key} id. Expected one of: ${validated.ids.join(", ")}.`,
		);
	}
};

/** What a knot's walk observed, for the whole-knot rules checked afterwards. */
type KnotTally = { emitsText: boolean; namesSpeaker: boolean };

/**
 * Recursively walks a compiled container, checking every `"#"`…`"/#"` tag run it
 * finds at any depth — tags live inside `start`, `grp` and `c-0` sub-containers,
 * not only at the top of a stitch.
 *
 * `atKnotLevel` marks the one depth where a named sub-container is a stitch, so
 * a failure can name the stitch the author wrote.
 */
const checkTags = (
	content: readonly unknown[],
	site: TagSite,
	atKnotLevel: boolean,
	tally: KnotTally,
): void => {
	let run: TagRun | null = null;
	for (const item of content) {
		if (item === TAG_BEGIN) {
			run = { text: "", dynamic: false };
			continue;
		}
		if (item === TAG_END) {
			if (run) {
				checkTag(site, run);
				if (run.text.trim().startsWith(`${SPEAKER_KEY}:`)) {
					tally.namesSpeaker = true;
				}
				run = null;
			}
			continue;
		}
		if (run) {
			if (typeof item === "string" && item.startsWith(TAG_TEXT)) {
				run.text += item.slice(1);
			} else {
				run.dynamic = true;
			}
			continue;
		}
		if (typeof item === "string" && item.startsWith(TAG_TEXT)) {
			if (item.slice(1).trim().length > 0) {
				tally.emitsText = true;
			}
			continue;
		}
		if (Array.isArray(item)) {
			checkTags(item, site, false, tally);
			continue;
		}
		for (const [name, child] of namedChildren([item])) {
			const nested =
				atKnotLevel && IDENT.test(name)
					? { ...site, stitch: name }
					: site;
			checkTags(child, nested, false, tally);
		}
	}
};

const checkAllTags = (
	story: Story,
	owner: Map<string, string>,
): void => {
	const root = compiledRoot(story);
	for (const [knot, content] of namedChildren(root)) {
		if (!IDENT.test(knot)) {
			continue;
		}
		const site: TagSite = {
			knot,
			stitch: null,
			file: owner.get(knot) ?? "",
		};
		const tally: KnotTally = {
			emitsText: false,
			namesSpeaker: false,
		};
		checkTags(content, site, true, tally);
		if (tally.emitsText && !tally.namesSpeaker) {
			throw new Error(
				`Ink knot ${siteLabel(site)} emits text but never names a "${SPEAKER_KEY}:". Every line that reaches the screen needs a character to be portrayed as — its font, portrait and alignment all come from the descriptor. Add a "# ${SPEAKER_KEY}: <id>" tag. Known ids: ${CHARACTER_IDS.join(", ")}.`,
			);
		}
	}
	for (const item of root) {
		if (Array.isArray(item)) {
			checkTags(
				item,
				{ knot: TOP_LEVEL, stitch: null, file: "" },
				false,
				{ emitsText: false, namesSpeaker: false },
			);
		}
	}
};

const pascalCase = (snake: string): string =>
	snake
		.split("_")
		.filter((part) => part.length > 0)
		.map((part) => part[0]!.toUpperCase() + part.slice(1))
		.join("");

const rulesFor = (knot: string): readonly StitchPerMemberRule[] =>
	STITCH_PER_MEMBER_RULES.filter((rule) => rule.knot === knot);

const emitRule = (
	knot: KnotInfo,
	rule: StitchPerMemberRule,
): string[] => {
	const present = new Set(knot.stitches);
	const entries: string[] = [];
	for (const member of rule.members) {
		const stitch = rule.stitchFor(member);
		if (!present.has(stitch)) {
			throw new Error(
				`Expected stitch "${knot.name}.${stitch}" for "${member}" but it was not found. Every member of the tuple behind ${knot.name}.${rule.member} needs its own stitch.`,
			);
		}
		entries.push(
			`\t\t${JSON.stringify(member)}: asKnot(${JSON.stringify(`${knot.name}.${stitch}`)}),`,
		);
	}
	return [
		`\texport const ${rule.member}: ${rule.valueType} = {`,
		...entries,
		`\t};`,
	];
};

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
	for (const rule of rulesFor(knot.name)) {
		lines.push(...emitRule(knot, rule));
	}
	lines.push(`}`);
	return lines.join("\n");
};

const render = (knots: KnotInfo[]): string => {
	const header = [
		"// GENERATED FILE - DO NOT EDIT.",
		"// Produced by scripts/gen-ink.ts from src/game/content/dialogue/*.ink.",
		"// Run `bun run gen` to regenerate.",
		"",
		'import { asKnot, type Knot } from "../../../engine/ink/knot";',
	];
	const imports = new Set<string>();
	for (const knot of knots) {
		for (const rule of rulesFor(knot.name)) {
			for (const line of rule.imports) {
				imports.add(line);
			}
		}
	}
	header.push(...imports);
	header.push("");
	const body = knots.map(emitNamespace).join("\n\n");
	return `${header.join("\n")}\n${body}\n`;
};

const existing = (): string | null => {
	try {
		return readFileSync(OUT_FILE, "utf8");
	} catch {
		return null;
	}
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
	checkAllTags(story, owner);
	const container =
		story.mainContentContainer as unknown as Container;
	const knots = walkKnots(container, owner);
	const rendered = render(knots);
	if (existing() !== rendered) {
		writeFileSync(OUT_FILE, rendered, "utf8");
	}
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
