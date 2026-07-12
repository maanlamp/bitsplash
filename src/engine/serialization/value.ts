import {
	type SerializableType,
	serializableType,
	serializableTypeName,
} from "./registry";
import { VALUE_TYPE } from "./serializable-value";

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

const NON_FINITE: Record<string, number> = {
	Infinity: Infinity,
	"-Infinity": -Infinity,
	NaN: Number.NaN,
};

const encodeNonFinite = (value: number): { $number: string } => ({
	$number:
		value === Infinity
			? "Infinity"
			: value === -Infinity
				? "-Infinity"
				: "NaN",
});

export const encodeValue = (value: unknown): unknown => {
	if (typeof value === "number" && !Number.isFinite(value)) {
		return encodeNonFinite(value);
	}
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

const isValueType = (value: unknown): value is object =>
	value !== null && typeof value === "object" && VALUE_TYPE in value;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null &&
	typeof value === "object" &&
	!Array.isArray(value);

const describe = (value: unknown): string =>
	value === null
		? "null"
		: Array.isArray(value)
			? "an array"
			: typeof value === "object"
				? JSON.stringify(value)
				: `${typeof value} ${JSON.stringify(value)}`;

// Fill an existing value-type instance in place from its serialized form.
// The datum must be an object whose $type matches the instance's registered
// type; anything else is a hard failure naming the offending path. Nested
// value-type fields recurse (fill in place) so non-serialized schema state
// on the default instance survives loading.
const fillValueType = (
	target: object,
	datum: unknown,
	path: string,
): void => {
	const typeName = serializableTypeName(target)!;
	if (!isRecord(datum) || datum.$type !== typeName) {
		throw new Error(
			`${path}: expected a "${typeName}" value ({ "$type": "${typeName}", … }) but got ${describe(datum)}`,
		);
	}
	const type = serializableType(typeName)!;
	const record = target as Record<string, unknown>;
	for (const field of type.fields.keys()) {
		if (!(field in datum)) {
			continue;
		}
		const fieldPath = `${path}.${field}`;
		const current = record[field];
		if (isValueType(current)) {
			fillValueType(current, datum[field], fieldPath);
		} else {
			record[field] = decodeValue(datum[field]);
		}
	}
};

export const reconstruct = (
	type: SerializableType,
	data: Record<string, unknown>,
	path: string = type.name,
): object => {
	const instance = new type.ctor() as Record<string, unknown>;
	for (const field of type.fields.keys()) {
		if (!(field in data)) {
			continue;
		}
		const current = instance[field];
		if (isValueType(current)) {
			fillValueType(current, data[field], `${path}.${field}`);
		} else {
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
	if (
		typeof record.$number === "string" &&
		record.$number in NON_FINITE
	) {
		return NON_FINITE[record.$number];
	}
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
