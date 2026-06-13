import {
	Font,
	getFontFamily,
	getNameById,
	isBold,
	isItalic,
	NameId,
	PixelMode,
	rasterizeGlyph,
} from "text-shaper";

export const STYLE_REGULAR = 0;
export const STYLE_BOLD = 1;
export const STYLE_ITALIC = 2;
export const STYLE_BOLD_ITALIC = 3;

export type FontStyle = 0 | 1 | 2 | 3;

const ITALIC_SLANT = 0.33;

export type GlyphVariant = Readonly<{
	mask: Uint8Array;
	width: number;
	rows: number;
	bearingX: number;
	bearingY: number;
}>;

export type GlyphCache = Map<number, GlyphVariant>;

export type Face = Readonly<{
	shape: Font;
	glyphCache: GlyphCache;
	scale: number;
	weight: number;
	italic: boolean;
	synthetic: Readonly<{ bold: boolean; italic: boolean }> | null;
}>;

export type LoadedFont = Readonly<{
	name: string;
	size: number;
	lineHeight: number;
	ascent: number;
	faces: Readonly<Record<FontStyle, Face>>;
}>;

interface LoadFontOptions {
	chars?: string;
	size?: number;
}

const DEFAULT_CHARS = Array.from(
	{ length: 0x7e - 0x20 + 1 },
	(_, i) => String.fromCodePoint(i + 0x20),
).join("");

/** @deprecated Use assetmanager instead */
export const loadImage = (url: string): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Failed to load ${url}`));
		image.src = url;
	});

const dilateBold = (variant: GlyphVariant): GlyphVariant => {
	const { mask, width, rows, bearingX, bearingY } = variant;
	const out = new Uint8Array((width + 1) * rows);
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col <= width; col++) {
			const here = col < width ? mask[row * width + col]! : 0;
			const left = col > 0 ? mask[row * width + col - 1]! : 0;
			out[row * (width + 1) + col] = here || left;
		}
	}
	return { mask: out, width: width + 1, rows, bearingX, bearingY };
};

const shearItalic = (variant: GlyphVariant): GlyphVariant => {
	const { mask, width, rows, bearingX, bearingY } = variant;
	const maxShift = Math.round((rows - 1) * ITALIC_SLANT);
	const outW = width + maxShift;
	const out = new Uint8Array(outW * rows);
	for (let row = 0; row < rows; row++) {
		const shift = Math.round((rows - 1 - row) * ITALIC_SLANT);
		for (let col = 0; col < width; col++) {
			if (mask[row * width + col] === 0) {
				continue;
			}
			out[row * outW + col + shift] = 255;
		}
	}
	return { mask: out, width: outW, rows, bearingX, bearingY };
};

const rasterizeGlyphs = (
	font: Font,
	size: number,
	chars: string,
): GlyphCache => {
	const cache: GlyphCache = new Map();
	for (const char of chars) {
		const codePoint = char.codePointAt(0);
		if (codePoint === undefined) {
			continue;
		}
		const glyphId = font.glyphId(codePoint);
		if (glyphId === 0) {
			continue;
		}
		const rasterized = rasterizeGlyph(font, glyphId, size, {
			pixelMode: PixelMode.Mono,
			hinting: true,
		});
		if (!rasterized) {
			continue;
		}
		const { bitmap, bearingX, bearingY } = rasterized;
		const { buffer: src, width, rows, pitch } = bitmap;
		const mask = new Uint8Array(width * rows);
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < width; col++) {
				const byteIndex = row * pitch + (col >> 3);
				const bitIndex = 7 - (col & 7);
				mask[row * width + col] =
					(src[byteIndex]! >> bitIndex) & 1 ? 255 : 0;
			}
		}
		cache.set(glyphId, { mask, width, rows, bearingX, bearingY });
	}
	return cache;
};

type NativeRaster = Readonly<{
	font: Font;
	glyphCache: GlyphCache;
	scale: number;
	lineHeight: number;
	ascent: number;
	weight: number;
	italic: boolean;
}>;

const rasterizeNative = async (
	bytes: ArrayBuffer,
	size: number,
	chars: string,
): Promise<NativeRaster> => {
	const font = await Font.loadAsync(bytes);
	const glyphCache = rasterizeGlyphs(font, size, chars);
	const scale = size / font.unitsPerEm;
	const os2 = font.os2;
	const macStyle = font.head.macStyle;
	const italic = os2 ? isItalic(os2) : (macStyle & 0x2) !== 0;
	const bold = os2 ? isBold(os2) : (macStyle & 0x1) !== 0;
	const weight = os2?.usWeightClass ?? (bold ? 700 : 400);
	return {
		font,
		glyphCache,
		scale,
		lineHeight: font.height * scale,
		ascent: font.ascender * scale,
		weight,
		italic,
	};
};

const transformCache = (
	cache: GlyphCache,
	bold: boolean,
	italic: boolean,
): GlyphCache => {
	const out: GlyphCache = new Map();
	for (const [glyphId, variant] of cache) {
		let glyph = variant;
		if (bold) {
			glyph = dilateBold(glyph);
		}
		if (italic) {
			glyph = shearItalic(glyph);
		}
		out.set(glyphId, glyph);
	}
	return out;
};

const nativeFace = (raster: NativeRaster): Face => ({
	shape: raster.font,
	glyphCache: raster.glyphCache,
	scale: raster.scale,
	weight: raster.weight,
	italic: raster.italic,
	synthetic: null,
});

const syntheticFace = (
	source: NativeRaster,
	bold: boolean,
	italic: boolean,
): Face => ({
	shape: source.font,
	glyphCache: transformCache(source.glyphCache, bold, italic),
	scale: source.scale,
	weight: bold ? 700 : source.weight,
	italic: italic || source.italic,
	synthetic: { bold, italic },
});

const nearest = (
	rasters: ReadonlyArray<NativeRaster>,
	italic: boolean,
	target: number,
	minWeight = 0,
): NativeRaster | null => {
	let best: NativeRaster | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const raster of rasters) {
		if (raster.italic !== italic || raster.weight < minWeight) {
			continue;
		}
		const distance = Math.abs(raster.weight - target);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = raster;
		}
	}
	return best;
};

const buildFamily = (
	name: string,
	rasters: ReadonlyArray<NativeRaster>,
	size: number,
): LoadedFont => {
	const base = nearest(rasters, false, 400) ?? rasters[0]!;
	const boldSrc = nearest(rasters, false, 700, 600);
	const italicSrc = nearest(rasters, true, 400);
	const boldItalicSrc = nearest(rasters, true, 700, 600);

	const regular = nativeFace(base);
	const bold = boldSrc
		? nativeFace(boldSrc)
		: syntheticFace(base, true, false);
	const italic = italicSrc
		? nativeFace(italicSrc)
		: syntheticFace(base, false, true);
	const boldItalic = boldItalicSrc
		? nativeFace(boldItalicSrc)
		: boldSrc
			? syntheticFace(boldSrc, false, true)
			: italicSrc
				? syntheticFace(italicSrc, true, false)
				: syntheticFace(base, true, true);

	return {
		name,
		size,
		lineHeight: base.lineHeight,
		ascent: base.ascent,
		faces: {
			[STYLE_REGULAR]: regular,
			[STYLE_BOLD]: bold,
			[STYLE_ITALIC]: italic,
			[STYLE_BOLD_ITALIC]: boldItalic,
		},
	};
};

const familyNameOf = (font: Font, fallback: string): string => {
	const name = font.name;
	if (!name) {
		return fallback;
	}
	return (
		getNameById(name, NameId.TypographicFamily) ??
		getFontFamily(name) ??
		fallback
	);
};

export const loadFontFamily = (
	name: string,
	faceBytes: ReadonlyArray<ArrayBuffer>,
	size = 12,
	chars: string = DEFAULT_CHARS,
): Promise<LoadedFont> =>
	Promise.all(
		faceBytes.map((bytes) => rasterizeNative(bytes, size, chars)),
	).then((rasters) => buildFamily(name, rasters, size));

/** @deprecated Use assetmanager instead */
export const loadFont = async (
	url: string,
	{ chars = DEFAULT_CHARS, size = 12 }: LoadFontOptions = {},
): Promise<LoadedFont> => {
	const buffer = await fetch(url).then((b) => b.arrayBuffer());
	const raster = await rasterizeNative(buffer, size, chars);
	const fallback = url.split("/").pop()?.split(".")[0] ?? url;
	return buildFamily(
		familyNameOf(raster.font, fallback),
		[raster],
		size,
	);
};
