import Angle from "../angle.ts";
import Vector2 from "../vector2";

const isPlainObject = (value: object): boolean => {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

export const encodeValue = (value: unknown): unknown => {
	if (value === null || typeof value !== "object") {
		return typeof value === "function" ? undefined : value;
	}
	if (value instanceof Vector2) {
		return { $type: Vector2.name, x: value.x, y: value.y };
	}
	if (value instanceof Angle) {
		return { $type: Angle.name, x: value.x, y: value.y };
	}
	if (Array.isArray(value)) {
		return value.map(encodeValue);
	}
	if (!isPlainObject(value)) {
		return undefined;
	}
	const out: Record<string, unknown> = {};
	for (const [key, v] of Object.entries(value)) {
		const encoded = encodeValue(v);
		if (encoded !== undefined) {
			out[key] = encoded;
		}
	}
	return out;
};

export const decodeValue = (value: unknown): unknown => {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(decodeValue);
	}
	const record = value as Record<string, unknown>;
	if (record.$type === Vector2.name) {
		return new Vector2(record.x as number, record.y as number);
	}
	if (record.$type === Angle.name) {
		return new Angle(record.radians as number);
	}
	const out: Record<string, unknown> = {};
	for (const [key, v] of Object.entries(record)) {
		out[key] = decodeValue(v);
	}
	return out;
};
