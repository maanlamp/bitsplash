import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readBspriteManifest } from "../src/engine/sprite/sprite-asset";

const ASSETS_DIR = fileURLToPath(
	new URL("../src/game/content/assets/", import.meta.url),
);
const OUT_FILE = join(ASSETS_DIR, "assets.gen.ts");

const SERVED_PREFIX = "/src/game/content/assets/";
const BSPRITE_SUFFIX = ".bsprite";
const VOICE_BANK_PREFIX = "voice_bank_";
const VOICE_BANK_SUFFIX = ".wav";
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_TAG_MEMBERS = new Set(["url"]);

type SpriteInfo = {
	file: string;
	namespace: string;
	url: string;
	tags: { member: string; name: string }[];
};

type VoiceBankInfo = {
	file: string;
	id: string;
	member: string;
};

const assetFiles = (): string[] =>
	readdirSync(ASSETS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.sort();

const identifier = (raw: string): string => {
	const parts = raw
		.split(/[^A-Za-z0-9]+/)
		.filter((p) => p.length > 0);
	const head = parts[0] ?? "";
	const camel = [
		head,
		...parts.slice(1).map((p) => p[0]!.toUpperCase() + p.slice(1)),
	].join("");
	return IDENT.test(camel) ? camel : `_${camel}`;
};

const pascalCase = (raw: string): string => {
	const member = identifier(raw);
	return member[0]!.toUpperCase() + member.slice(1);
};

const claim = (
	taken: Map<string, string>,
	member: string,
	source: string,
	what: string,
): void => {
	const existing = taken.get(member);
	if (existing !== undefined) {
		throw new Error(
			`${what} "${source}" and "${existing}" both generate the accessor name "${member}". Rename one so every accessor is addressable.`,
		);
	}
	taken.set(member, source);
};

const readSprites = (files: string[]): SpriteInfo[] => {
	const namespaces = new Map<string, string>();
	const sprites: SpriteInfo[] = [];
	for (const file of files) {
		if (!file.endsWith(BSPRITE_SUFFIX)) {
			continue;
		}
		const stem = file.slice(0, -BSPRITE_SUFFIX.length);
		const namespace = `${pascalCase(stem)}Sprite`;
		claim(namespaces, namespace, file, "Sprite assets");
		const manifest = readBspriteManifest(
			readFileSync(join(ASSETS_DIR, file)),
		);
		const members = new Map<string, string>();
		const tags = manifest.tags.map((tag) => {
			const member = identifier(tag.name);
			if (RESERVED_TAG_MEMBERS.has(member)) {
				throw new Error(
					`Sprite tag "${tag.name}" in ${file} collides with a reserved generated member name (${[...RESERVED_TAG_MEMBERS].join(", ")}).`,
				);
			}
			claim(members, member, tag.name, `Tags in ${file}`);
			return { member, name: tag.name };
		});
		sprites.push({
			file,
			namespace,
			url: `${SERVED_PREFIX}${file}`,
			tags,
		});
	}
	return sprites;
};

const readVoiceBanks = (files: string[]): VoiceBankInfo[] => {
	const members = new Map<string, string>();
	const banks: VoiceBankInfo[] = [];
	for (const file of files) {
		if (
			!file.startsWith(VOICE_BANK_PREFIX) ||
			!file.endsWith(VOICE_BANK_SUFFIX)
		) {
			continue;
		}
		const id = file.slice(
			VOICE_BANK_PREFIX.length,
			-VOICE_BANK_SUFFIX.length,
		);
		const member = identifier(id);
		claim(members, member, id, "Voice banks");
		banks.push({ file, id, member });
	}
	return banks;
};

const emitSprite = (sprite: SpriteInfo): string => {
	const lines = [`export namespace ${sprite.namespace} {`];
	lines.push(
		`\texport const url: string = ${JSON.stringify(sprite.url)};`,
	);
	for (const tag of sprite.tags) {
		lines.push(
			`\texport const ${tag.member}: SpriteTag = asSpriteTag(${JSON.stringify(tag.name)});`,
		);
	}
	lines.push(`}`);
	return lines.join("\n");
};

const emitVoiceBanks = (banks: VoiceBankInfo[]): string => {
	const lines = ["export namespace VoiceBanks {"];
	for (const bank of banks) {
		lines.push(
			`\texport const ${bank.member}: VoiceBankId = asVoiceBankId(${JSON.stringify(bank.id)});`,
		);
	}
	lines.push("}");
	lines.push("");
	lines.push(
		"export const VOICE_BANK_URLS: Readonly<Record<string, string>> = {",
	);
	for (const bank of banks) {
		const key = IDENT.test(bank.id)
			? bank.id
			: JSON.stringify(bank.id);
		lines.push(`\t${key}: ${bank.member}Url,`);
	}
	lines.push("};");
	return lines.join("\n");
};

const render = (
	sprites: SpriteInfo[],
	banks: VoiceBankInfo[],
): string => {
	const header = [
		"// GENERATED FILE - DO NOT EDIT.",
		"// Produced by scripts/gen-assets.ts from src/game/content/assets/.",
		"// Run `bun run gen` to regenerate.",
		"//",
		"// A sprite's `url` is the served path rather than an ESM asset import, so it",
		"// still ends in `.bsprite` for the sprite facade's classifier.",
		"",
	];
	if (sprites.length > 0) {
		header.push(
			'import { asSpriteTag, type SpriteTag } from "../../../engine/sprite/sprite-tag";',
		);
	}
	if (banks.length > 0) {
		header.push(
			'import { asVoiceBankId, type VoiceBankId } from "../../dialogue/voice-bank-id";',
		);
		for (const bank of banks) {
			header.push(
				`import ${bank.member}Url from ${JSON.stringify(`./${bank.file}?url`)};`,
			);
		}
	}
	header.push("");
	const blocks = sprites.map(emitSprite);
	if (banks.length > 0) {
		blocks.push(emitVoiceBanks(banks));
	}
	return `${header.join("\n")}\n${blocks.join("\n\n")}\n`;
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
	sprites: SpriteInfo[];
	banks: VoiceBankInfo[];
} => {
	const files = assetFiles();
	const sprites = readSprites(files);
	const banks = readVoiceBanks(files);
	const rendered = render(sprites, banks);
	if (existing() !== rendered) {
		writeFileSync(OUT_FILE, rendered, "utf8");
	}
	return { outFile: OUT_FILE, sprites, banks };
};

/**
 * Check every {@link import("../src/game/character/character-descriptor").CharacterDescriptor}
 * reference against what the assets actually contain, so a dangling portrait tag
 * or voice bank fails here instead of rendering a wrong crop or going silent.
 *
 * The descriptor module is imported dynamically, after the accessor module has
 * been written: a static import would fail outright on a checkout that has never
 * run codegen (`assets.gen.ts` is gitignored). Importing it also resolves the
 * fonts it registers, so a missing `.font.zip` fails here too.
 */
const validateCharacters = async (
	sprites: SpriteInfo[],
	banks: VoiceBankInfo[],
): Promise<number> => {
	const { CHARACTERS, PORTRAIT_SHEET_URL } =
		await import("../src/game/character/character-descriptor");
	const sheet = sprites.find((s) => s.url === PORTRAIT_SHEET_URL);
	if (!sheet) {
		throw new Error(
			`Portrait sheet ${PORTRAIT_SHEET_URL} is not a .bsprite in ${ASSETS_DIR}.`,
		);
	}
	const tags = new Set(sheet.tags.map((tag) => tag.name));
	const bankIds = new Set(banks.map((bank) => bank.id));
	for (const [id, descriptor] of Object.entries(CHARACTERS)) {
		const portrait: string | undefined = descriptor.portrait;
		if (portrait === undefined || !tags.has(portrait)) {
			throw new Error(
				`Character "${id}" names portrait tag ${JSON.stringify(portrait)}, which ${sheet.file} does not define. Tags: ${[...tags].join(", ")}.`,
			);
		}
		const voiceBank: string | undefined = descriptor.voiceBank;
		if (voiceBank === undefined || !bankIds.has(voiceBank)) {
			throw new Error(
				`Character "${id}" names voice bank ${JSON.stringify(voiceBank)}, for which there is no ${VOICE_BANK_PREFIX}<id>${VOICE_BANK_SUFFIX} asset. Banks: ${[...bankIds].join(", ")}.`,
			);
		}
	}
	return Object.keys(CHARACTERS).length;
};

const result = generate();
const characters = await validateCharacters(
	result.sprites,
	result.banks,
);
console.log(`Generated ${result.outFile}`);
for (const sprite of result.sprites) {
	const tags =
		sprite.tags.map((tag) => tag.name).join(", ") || "(no tags)";
	console.log(`  ${sprite.file} (${sprite.namespace}): ${tags}`);
}
console.log(
	`  voice banks: ${result.banks.map((bank) => bank.id).join(", ") || "(none)"}`,
);
console.log(`  ${characters} character descriptors validated`);
