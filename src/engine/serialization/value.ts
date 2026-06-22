import {
	type SerializableType,
	serializableType,
	serializableTypeName,
} from "./registry";

export const walkFields = (
	type: SerializableType,
	value: object,
): Record<string, unknown> => {
	const out: Record<string, unknown> = {};
	for (const field of type.fields.keys()) {
		const encoded = encodeValue(
			(value as Record<string, unknown>)[field],
		);
		if (encoded !== undefined) {
			out[field] = encoded;
		}
	}
	return out;
};

export const encodeValue = (value: unknown): unknown => {
	if (value === null || typeof value !== "object") {
		return typeof value === "function" ? undefined : value;
	}
	if (Array.isArray(value)) {
		return value.map(encodeValue);
	}
	const name = serializableTypeName(value);
	if (name) {
		const type = serializableType(name)!;
		return { $type: name, ...walkFields(type, value) };
	}
	const proto = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null) {
		return undefined;
	}
	const out: Record<string, unknown> = {};
	for (const [key, v] of Object.entries(value as object)) {
		const enc = encodeValue(v);
		if (enc !== undefined) {
			out[key] = enc;
		}
	}
	return out;
};

export const reconstruct = (
	type: SerializableType,
	data: Record<string, unknown>,
): object => {
	const instance = new type.ctor() as Record<string, unknown>;
	for (const field of type.fields.keys()) {
		if (field in data) {
			instance[field] = decodeValue(data[field]);
		}
	}
	return instance;
};

export const decodeValue = (value: unknown): unknown => {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(decodeValue);
	}
	const record = value as Record<string, unknown>;
	if (typeof record.$type === "string") {
		const type = serializableType(record.$type);
		if (type) {
			return reconstruct(type, record);
		}
	}
	const out: Record<string, unknown> = {};
	for (const [key, v] of Object.entries(record)) {
		out[key] = decodeValue(v);
	}
	return out;
};
