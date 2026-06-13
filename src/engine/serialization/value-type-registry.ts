export type ValueTypeAdapter<T extends object> = {
	encode: (v: T) => Record<string, unknown>;
	decode: (raw: Record<string, unknown>) => T;
};

type AnyAdapter = ValueTypeAdapter<object>;

const registry = new Map<string, AnyAdapter>();
const ctorNames = new Map<Function, string>();

export function registerValueType<T extends object>(
	ctor: new () => T,
): void;
export function registerValueType<T extends object>(
	ctor: abstract new (...args: never[]) => T,
	adapter: ValueTypeAdapter<T>,
): void;
export function registerValueType<T extends object>(
	ctor: abstract new (...args: never[]) => T,
	adapter?: ValueTypeAdapter<T>,
): void {
	const name = ctor.name;
	ctorNames.set(ctor, name);
	registry.set(name, {
		encode:
			adapter?.encode ??
			((v) => {
				const out: Record<string, unknown> = {};
				for (const [k, val] of Object.entries(v)) {
					out[k] = val;
				}
				return out;
			}),
		decode:
			adapter?.decode ??
			((raw) =>
				Object.assign(new (ctor as unknown as new () => T)(), raw)),
	} as unknown as AnyAdapter);
}

export const getValueTypeAdapter = (
	typeName: string,
): AnyAdapter | undefined => registry.get(typeName);

export const getValueTypeName = (value: object): string | undefined =>
	ctorNames.get(value.constructor as Function);
