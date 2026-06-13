import {
	getValueTypeAdapter,
	getValueTypeName,
} from "./value-type-registry";

export const encodeValue = (value: unknown): unknown => {
	if (value === null || typeof value !== "object") {
		return typeof value === "function" ? undefined : value;
	}
	if (Array.isArray(value)) {
		return value.map(encodeValue);
	}
	const typeName = getValueTypeName(value);
	if (typeName) {
		const adapter = getValueTypeAdapter(typeName)!;
		const encoded: Record<string, unknown> = { $type: typeName };
		for (const [k, v] of Object.entries(adapter.encode(value))) {
			encoded[k] = encodeValue(v);
		}
		return encoded;
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

export const decodeValue = (value: unknown): unknown => {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(decodeValue);
	}
	const record = value as Record<string, unknown>;
	if (typeof record.$type === "string") {
		const adapter = getValueTypeAdapter(record.$type);
		if (adapter) {
			const raw: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(record)) {
				if (k !== "$type") {
					raw[k] = decodeValue(v);
				}
			}
			return adapter.decode(raw);
		}
	}
	const out: Record<string, unknown> = {};
	for (const [key, v] of Object.entries(record)) {
		out[key] = decodeValue(v);
	}
	return out;
};
