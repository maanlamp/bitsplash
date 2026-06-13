import { unzipSync } from "fflate";
import {
	Font,
	getFontFamily,
	getFontSubfamily,
	getNameById,
	isBold,
	isItalic,
	NameId,
} from "text-shaper";
import { type LoadedFont, loadFontFamily } from "./load";

const FONT_EXTENSION = /\.(ttf|otf|woff2?)$/i;

export type FaceAxis = Readonly<{
	tag: string;
	min: number;
	default: number;
	max: number;
}>;

export type FaceSource = Readonly<{
	bytes: Uint8Array;
	family: string;
	subfamily: string;
	weight: number;
	italic: boolean;
	widthClass: number;
	axes: ReadonlyArray<FaceAxis>;
}>;

export type FamilySource = Readonly<{
	name: string;
	faces: ReadonlyArray<FaceSource>;
}>;

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
	bytes.byteOffset === 0 &&
	bytes.byteLength === bytes.buffer.byteLength
		? (bytes.buffer as ArrayBuffer)
		: (bytes.slice().buffer as ArrayBuffer);

const decodeTag = (tag: number): string =>
	String.fromCharCode(
		(tag >>> 24) & 0xff,
		(tag >>> 16) & 0xff,
		(tag >>> 8) & 0xff,
		tag & 0xff,
	);

export const readFaceMeta = async (
	bytes: Uint8Array,
): Promise<FaceSource> => {
	const font = await Font.loadAsync(toArrayBuffer(bytes));
	const name = font.name;
	const os2 = font.os2;
	const macStyle = font.head.macStyle;
	const family =
		(name &&
			(getNameById(name, NameId.TypographicFamily) ??
				getFontFamily(name))) ||
		"Unknown";
	const subfamily =
		(name &&
			(getNameById(name, NameId.TypographicSubfamily) ??
				getFontSubfamily(name))) ||
		"Regular";
	const italic = os2 ? isItalic(os2) : (macStyle & 0x2) !== 0;
	const bold = os2 ? isBold(os2) : (macStyle & 0x1) !== 0;
	const weight = os2?.usWeightClass ?? (bold ? 700 : 400);
	const widthClass = os2?.usWidthClass ?? 5;
	const axes =
		font.fvar?.axes.map((axis) => ({
			tag: decodeTag(axis.tag),
			min: axis.minValue,
			default: axis.defaultValue,
			max: axis.maxValue,
		})) ?? [];
	return {
		bytes,
		family,
		subfamily,
		weight,
		italic,
		widthClass,
		axes,
	};
};

export const unzipFonts = (
	zip: Uint8Array,
): ReadonlyArray<Readonly<{ name: string; bytes: Uint8Array }>> =>
	Object.entries(unzipSync(zip))
		.filter(
			([name]) =>
				FONT_EXTENSION.test(name) && !name.includes("__MACOSX"),
		)
		.map(([name, bytes]) => ({ name, bytes }));

export const groupFamilies = (
	faces: ReadonlyArray<FaceSource>,
): FamilySource[] => {
	const byName = new Map<string, FaceSource[]>();
	for (const face of faces) {
		const list = byName.get(face.family);
		if (list) {
			list.push(face);
		} else {
			byName.set(face.family, [face]);
		}
	}
	return [...byName].map(([name, grouped]) => ({
		name,
		faces: grouped,
	}));
};

const fetchBytes = async (url: string): Promise<Uint8Array> =>
	new Uint8Array(await (await fetch(url)).arrayBuffer());

export const loadFamiliesFromZip = async (
	url: string,
): Promise<FamilySource[]> => {
	const entries = unzipFonts(await fetchBytes(url));
	const faces = await Promise.all(
		entries.map((entry) => readFaceMeta(entry.bytes)),
	);
	return groupFamilies(faces);
};

export const loadFamilyFromFont = async (
	url: string,
): Promise<FamilySource[]> =>
	groupFamilies([await readFaceMeta(await fetchBytes(url))]);

const isZipUrl = (url: string): boolean => /\.zip(\?|$)/i.test(url);

export const loadFontsFromUrl = async (
	url: string,
	size = 12,
): Promise<LoadedFont[]> => {
	const families = isZipUrl(url)
		? await loadFamiliesFromZip(url)
		: await loadFamilyFromFont(url);
	return Promise.all(
		families.map((family) =>
			loadFontFamily(
				family.name,
				family.faces.map((face) => toArrayBuffer(face.bytes)),
				size,
			),
		),
	);
};
