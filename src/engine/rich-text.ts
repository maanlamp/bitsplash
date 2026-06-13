import {
	UnicodeBuffer,
	glyphBufferToShapedGlyphs,
	shape,
} from "text-shaper";
import {
	type FontStyle,
	type LoadedFont,
	STYLE_BOLD,
	STYLE_ITALIC,
	STYLE_REGULAR,
} from "./load";

export const WAVE_DEFAULT_FORCE = 1;
export const WAVE_DEFAULT_SPEED = 10;

export type Wave = Readonly<{ force: number; speed: number }>;

export type Style = Readonly<{
	bold: boolean;
	italic: boolean;
	color: string | null;
	wave: Wave | null;
	link: string | null;
}>;

export type StyledChar = Readonly<{ char: string; style: Style }>;

export type RichGlyph = Readonly<{
	glyphId: number;
	style: FontStyle;
	x: number;
	char: string;
	color: string | null;
	wave: Wave | null;
}>;

export type RichLine = Readonly<{ glyphs: RichGlyph[] }>;

const BASE_STYLE: Style = {
	bold: false,
	italic: false,
	color: null,
	wave: null,
	link: null,
};

const decodeEntities = (text: string): string =>
	text
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");

const parseNumber = (value: string | undefined): number | null => {
	if (value === undefined) {
		return null;
	}
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
};

const stripQuotes = (value: string): string =>
	value.length >= 2 &&
	(value[0] === '"' || value[0] === "'") &&
	value.at(-1) === value[0]
		? value.slice(1, -1)
		: value;

type Tag = Readonly<{
	name: string;
	shorthand: string | null;
	attrs: Map<string, string>;
}>;

const parseTag = (inner: string): Tag => {
	const tokens = inner.trim().split(/\s+/);
	const first = tokens[0] ?? "";
	const eq = first.indexOf("=");
	let name = first;
	let shorthand: string | null = null;
	if (eq >= 0) {
		name = first.slice(0, eq);
		shorthand = stripQuotes(first.slice(eq + 1));
	}
	const attrs = new Map<string, string>();
	for (const token of tokens.slice(1)) {
		const i = token.indexOf("=");
		if (i >= 0) {
			attrs.set(token.slice(0, i), stripQuotes(token.slice(i + 1)));
		}
	}
	return { name: name.toLowerCase(), shorthand, attrs };
};

const applyTag = (current: Style, tag: Tag): Style => {
	switch (tag.name) {
		case "b":
			return { ...current, bold: true };
		case "i":
			return { ...current, italic: true };
		case "color":
			return {
				...current,
				color:
					tag.shorthand ?? tag.attrs.get("value") ?? current.color,
			};
		case "wave":
			return {
				...current,
				wave: {
					force:
						parseNumber(
							tag.attrs.get("force") ?? tag.shorthand ?? undefined,
						) ?? WAVE_DEFAULT_FORCE,
					speed:
						parseNumber(tag.attrs.get("speed")) ?? WAVE_DEFAULT_SPEED,
				},
			};
		case "a":
			return {
				...current,
				link:
					tag.shorthand ??
					tag.attrs.get("href") ??
					tag.attrs.get("target") ??
					current.link,
			};
		default:
			return current;
	}
};

export const parseRichText = (src: string): StyledChar[] => {
	const out: StyledChar[] = [];
	const stack: Array<{ name: string; style: Style }> = [];
	let current = BASE_STYLE;
	let i = 0;
	while (i < src.length) {
		const ch = src[i]!;
		if (ch === "<") {
			const end = src.indexOf(">", i);
			if (end < 0) {
				break;
			}
			const inner = src.slice(i + 1, end);
			if (inner.startsWith("/")) {
				const name = inner.slice(1).trim().toLowerCase();
				while (stack.length > 0) {
					const popped = stack.pop()!;
					if (popped.name === name) {
						break;
					}
				}
				current = stack.length > 0 ? stack.at(-1)!.style : BASE_STYLE;
			} else {
				const tag = parseTag(inner);
				current = applyTag(current, tag);
				stack.push({ name: tag.name, style: current });
			}
			i = end + 1;
			continue;
		}
		out.push({ char: decodeEntities(ch), style: current });
		i++;
	}
	return out;
};

const styleFlags = (style: Style): FontStyle =>
	((style.bold ? STYLE_BOLD : STYLE_REGULAR) |
		(style.italic ? STYLE_ITALIC : STYLE_REGULAR)) as FontStyle;

const advanceCache = new WeakMap<LoadedFont, Map<string, number>>();

const baseAdvance = (
	font: LoadedFont,
	char: string,
	style: FontStyle,
): number => {
	let cache = advanceCache.get(font);
	if (!cache) {
		cache = new Map();
		advanceCache.set(font, cache);
	}
	const cacheKey = `${style}:${char}`;
	const cached = cache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}
	const face = font.faces[style];
	const buffer = new UnicodeBuffer();
	buffer.addStr(char);
	const glyphs = glyphBufferToShapedGlyphs(shape(face.shape, buffer));
	let total = 0;
	for (const g of glyphs) {
		total += g.xAdvance;
	}
	const boldExtra = face.synthetic?.bold ? glyphs.length : 0;
	const advance = total * face.scale + boldExtra;
	cache.set(cacheKey, advance);
	return advance;
};

type WordGlyph = Readonly<{
	styled: StyledChar;
	glyphId: number;
	style: FontStyle;
	advance: number;
}>;

const buildWordGlyph = (
	font: LoadedFont,
	styled: StyledChar,
): WordGlyph => {
	const codePoint = styled.char.codePointAt(0) ?? 0x20;
	const style = styleFlags(styled.style);
	return {
		styled,
		glyphId: font.faces[style].shape.glyphId(codePoint),
		style,
		advance: baseAdvance(font, styled.char, style),
	};
};

export const wrapRichText = (
	font: LoadedFont,
	chars: StyledChar[],
	maxWidth: number,
): RichLine[] => {
	const lines: RichLine[] = [];
	const space: StyledChar = { char: " ", style: BASE_STYLE };
	const spaceAdvance = baseAdvance(font, " ", STYLE_REGULAR);

	const paragraphs: StyledChar[][] = [[]];
	for (const sc of chars) {
		if (sc.char === "\n") {
			paragraphs.push([]);
		} else {
			paragraphs.at(-1)!.push(sc);
		}
	}

	for (const paragraph of paragraphs) {
		const words: StyledChar[][] = [];
		let word: StyledChar[] = [];
		for (const sc of paragraph) {
			if (sc.char === " ") {
				if (word.length > 0) {
					words.push(word);
					word = [];
				}
			} else {
				word.push(sc);
			}
		}
		if (word.length > 0) {
			words.push(word);
		}

		let glyphs: RichGlyph[] = [];
		let cursorX = 0;

		const push = (g: WordGlyph): void => {
			glyphs.push({
				glyphId: g.glyphId,
				style: g.style,
				x: cursorX,
				char: g.styled.char,
				color: g.styled.style.color,
				wave: g.styled.style.wave,
			});
			cursorX += g.advance;
		};

		for (const w of words) {
			const wordGlyphs = w.map((sc) => buildWordGlyph(font, sc));
			const wordWidth = wordGlyphs.reduce((n, g) => n + g.advance, 0);
			if (
				glyphs.length > 0 &&
				cursorX + spaceAdvance + wordWidth > maxWidth
			) {
				lines.push({ glyphs });
				glyphs = [];
				cursorX = 0;
			} else if (glyphs.length > 0) {
				push(buildWordGlyph(font, space));
			}
			for (const g of wordGlyphs) {
				push(g);
			}
		}
		lines.push({ glyphs });
	}

	return lines;
};

export const richGlyphCount = (lines: RichLine[]): number =>
	lines.reduce((n, line) => n + line.glyphs.length, 0);

export const richText = (lines: RichLine[]): string =>
	lines
		.map((line) => line.glyphs.map((g) => g.char).join(""))
		.join("");
