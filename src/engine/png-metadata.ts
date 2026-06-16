import type { NineSliceInsets } from "./render/nine-slice";

const KEYWORD = "bitsplash";
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const readUint32 = (bytes: Uint8Array, offset: number): number =>
	((bytes[offset]! << 24) |
		(bytes[offset + 1]! << 16) |
		(bytes[offset + 2]! << 8) |
		bytes[offset + 3]!) >>>
	0;

const isPng = (bytes: Uint8Array): boolean =>
	SIGNATURE.every((b, i) => bytes[i] === b);

const decode = (bytes: Uint8Array): string =>
	new TextDecoder().decode(bytes);

const textFromChunk = (
	type: string,
	data: Uint8Array,
): string | null => {
	const nul = data.indexOf(0);
	if (nul < 0 || decode(data.subarray(0, nul)) !== KEYWORD) {
		return null;
	}
	if (type === "tEXt") {
		return decode(data.subarray(nul + 1));
	}
	const compressionFlag = data[nul + 1];
	if (compressionFlag !== 0) {
		return null;
	}
	let cursor = nul + 3;
	cursor = data.indexOf(0, cursor) + 1;
	cursor = data.indexOf(0, cursor) + 1;
	return decode(data.subarray(cursor));
};

export const readPngMetadata = (
	buffer: ArrayBuffer,
): Record<string, unknown> | null => {
	const bytes = new Uint8Array(buffer);
	if (!isPng(bytes)) {
		return null;
	}
	let offset = SIGNATURE.length;
	while (offset + 8 <= bytes.length) {
		const length = readUint32(bytes, offset);
		const type = decode(bytes.subarray(offset + 4, offset + 8));
		const data = bytes.subarray(offset + 8, offset + 8 + length);
		if (type === "iTXt" || type === "tEXt") {
			const text = textFromChunk(type, data);
			if (text !== null) {
				try {
					return JSON.parse(text) as Record<string, unknown>;
				} catch {
					return null;
				}
			}
		}
		if (type === "IEND") {
			break;
		}
		offset += 12 + length;
	}
	return null;
};

const isInsets = (value: unknown): value is NineSliceInsets =>
	typeof value === "object" &&
	value !== null &&
	["left", "right", "top", "bottom"].every(
		(key) =>
			typeof (value as Record<string, unknown>)[key] === "number",
	);

export const nineSliceInsets = (
	meta: Record<string, unknown> | null | undefined,
): NineSliceInsets | null => {
	const value = meta?.nineSlice;
	return isInsets(value) ? value : null;
};
