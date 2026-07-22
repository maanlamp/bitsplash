import { unzlibSync, zlibSync } from "fflate";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/**
 * A function that turns a {@link PixelBuffer} into PNG bytes. Injectable into
 * the `.bsprite` writer so the deterministic {@link encodePng} is the default
 * while tests can substitute a spy/alternate encoder.
 */
export type PngEncoder = (image: PixelBuffer) => Uint8Array;

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

const crc32 = (bytes: Uint8Array): number => {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
};

const u32 = (value: number): Uint8Array =>
	new Uint8Array([
		(value >>> 24) & 0xff,
		(value >>> 16) & 0xff,
		(value >>> 8) & 0xff,
		value & 0xff,
	]);

const chunk = (type: string, data: Uint8Array): Uint8Array => {
	const typeBytes = new Uint8Array(4);
	for (let i = 0; i < 4; i++) {
		typeBytes[i] = type.charCodeAt(i);
	}
	const body = new Uint8Array(typeBytes.length + data.length);
	body.set(typeBytes, 0);
	body.set(data, typeBytes.length);
	const out = new Uint8Array(4 + body.length + 4);
	out.set(u32(data.length), 0);
	out.set(body, 4);
	out.set(u32(crc32(body)), 4 + body.length);
	return out;
};

/**
 * Encode a straight-alpha RGBA {@link PixelBuffer} as an 8-bit color-type-6 PNG.
 *
 * The output is **deterministic**: identical pixels always yield identical
 * bytes (filter type 0 on every scanline, a single `zlibSync` IDAT). This is
 * what makes the `.bsprite` cel/bake entries byte-stable across saves without
 * relying on a browser's PNG encoder, and lets the whole writer run headlessly.
 *
 * @example
 * const bytes = encodePng({ width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) });
 */
export const encodePng: PngEncoder = (image) => {
	const { width, height, data } = image;
	const stride = width * 4;
	const raw = new Uint8Array((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		const src = y * stride;
		const dst = y * (stride + 1);
		raw[dst] = 0;
		raw.set(data.subarray(src, src + stride), dst + 1);
	}
	const ihdr = new Uint8Array(13);
	ihdr.set(u32(width), 0);
	ihdr.set(u32(height), 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	const idat = zlibSync(raw, { level: 6 });
	const chunks = [
		SIGNATURE,
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", new Uint8Array(0)),
	];
	const total = chunks.reduce((sum, c) => sum + c.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.length;
	}
	return out;
};

const readU32 = (bytes: Uint8Array, offset: number): number =>
	((bytes[offset]! << 24) |
		(bytes[offset + 1]! << 16) |
		(bytes[offset + 2]! << 8) |
		bytes[offset + 3]!) >>>
	0;

const CHANNELS: Readonly<Record<number, number>> = {
	0: 1,
	2: 3,
	3: 1,
	4: 2,
	6: 4,
};

const paeth = (a: number, b: number, c: number): number => {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) {
		return a;
	}
	return pb <= pc ? b : c;
};

const unfilter = (
	raw: Uint8Array,
	width: number,
	height: number,
	channels: number,
): Uint8Array => {
	const stride = width * channels;
	const out = new Uint8Array(stride * height);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)]!;
		const rowIn = y * (stride + 1) + 1;
		const rowOut = y * stride;
		const prevOut = rowOut - stride;
		for (let i = 0; i < stride; i++) {
			const x = raw[rowIn + i]!;
			const a = i >= channels ? out[rowOut + i - channels]! : 0;
			const b = y > 0 ? out[prevOut + i]! : 0;
			const c =
				y > 0 && i >= channels ? out[prevOut + i - channels]! : 0;
			let value: number;
			switch (filter) {
				case 1:
					value = x + a;
					break;
				case 2:
					value = x + b;
					break;
				case 3:
					value = x + ((a + b) >> 1);
					break;
				case 4:
					value = x + paeth(a, b, c);
					break;
				default:
					value = x;
			}
			out[rowOut + i] = value & 0xff;
		}
	}
	return out;
};

/** An indexed-PNG palette: RGB entries (`PLTE`) plus optional alpha (`tRNS`). */
type Palette = Readonly<{
	rgb: Uint8Array;
	alpha: Uint8Array | null;
}>;

const toRgba = (
	samples: Uint8Array,
	width: number,
	height: number,
	colorType: number,
	palette: Palette | null,
): PixelBuffer => {
	const out = blankPixels(width, height);
	const channels = CHANNELS[colorType]!;
	for (let p = 0; p < width * height; p++) {
		const s = p * channels;
		const d = p * 4;
		if (colorType === 3) {
			const index = samples[s]!;
			out.data[d] = palette!.rgb[index * 3]!;
			out.data[d + 1] = palette!.rgb[index * 3 + 1]!;
			out.data[d + 2] = palette!.rgb[index * 3 + 2]!;
			out.data[d + 3] = palette!.alpha?.[index] ?? 255;
		} else if (colorType === 6) {
			out.data[d] = samples[s]!;
			out.data[d + 1] = samples[s + 1]!;
			out.data[d + 2] = samples[s + 2]!;
			out.data[d + 3] = samples[s + 3]!;
		} else if (colorType === 2) {
			out.data[d] = samples[s]!;
			out.data[d + 1] = samples[s + 1]!;
			out.data[d + 2] = samples[s + 2]!;
			out.data[d + 3] = 255;
		} else if (colorType === 4) {
			out.data[d] = samples[s]!;
			out.data[d + 1] = samples[s]!;
			out.data[d + 2] = samples[s]!;
			out.data[d + 3] = samples[s + 1]!;
		} else {
			out.data[d] = samples[s]!;
			out.data[d + 1] = samples[s]!;
			out.data[d + 2] = samples[s]!;
			out.data[d + 3] = 255;
		}
	}
	return out;
};

/**
 * Decode an 8-bit, non-interlaced PNG (color types 0/2/3/4/6) into a straight-
 * alpha RGBA {@link PixelBuffer}. A genuine, spec-compliant decoder (all five
 * scanline filters); indexed color (type 3) is resolved through its `PLTE`
 * palette and optional `tRNS` alpha. Used by tests to verify baked pixels
 * headlessly and to read the shipping actor PNG strips.
 *
 * @throws if the bytes are not a PNG, or use an unsupported bit depth /
 * interlace encoding.
 */
export const decodePng = (bytes: Uint8Array): PixelBuffer => {
	for (let i = 0; i < SIGNATURE.length; i++) {
		if (bytes[i] !== SIGNATURE[i]) {
			throw new Error("Not a PNG (bad signature)");
		}
	}
	let width = 0;
	let height = 0;
	let colorType = 6;
	let paletteRgb: Uint8Array | null = null;
	let paletteAlpha: Uint8Array | null = null;
	const idatParts: Uint8Array[] = [];
	let offset = SIGNATURE.length;
	while (offset < bytes.length) {
		const length = readU32(bytes, offset);
		const type = String.fromCharCode(
			bytes[offset + 4]!,
			bytes[offset + 5]!,
			bytes[offset + 6]!,
			bytes[offset + 7]!,
		);
		const dataStart = offset + 8;
		if (type === "IHDR") {
			width = readU32(bytes, dataStart);
			height = readU32(bytes, dataStart + 4);
			const bitDepth = bytes[dataStart + 8]!;
			colorType = bytes[dataStart + 9]!;
			const interlace = bytes[dataStart + 12]!;
			if (bitDepth !== 8 || interlace !== 0) {
				throw new Error(
					`Unsupported PNG (depth ${bitDepth}, color ${colorType}, interlace ${interlace})`,
				);
			}
		} else if (type === "PLTE") {
			paletteRgb = bytes.subarray(dataStart, dataStart + length);
		} else if (type === "tRNS") {
			paletteAlpha = bytes.subarray(dataStart, dataStart + length);
		} else if (type === "IDAT") {
			idatParts.push(bytes.subarray(dataStart, dataStart + length));
		} else if (type === "IEND") {
			break;
		}
		offset = dataStart + length + 4;
	}
	const compressedLength = idatParts.reduce(
		(sum, p) => sum + p.length,
		0,
	);
	const compressed = new Uint8Array(compressedLength);
	let c = 0;
	for (const part of idatParts) {
		compressed.set(part, c);
		c += part.length;
	}
	const channels = CHANNELS[colorType]!;
	const raw = unzlibSync(compressed);
	const samples = unfilter(raw, width, height, channels);
	const palette =
		colorType === 3 && paletteRgb
			? { rgb: paletteRgb, alpha: paletteAlpha }
			: null;
	return toRgba(samples, width, height, colorType, palette);
};
