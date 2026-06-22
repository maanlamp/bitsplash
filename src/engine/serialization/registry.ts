import {
	type SerializeOptions,
	VALUE_TYPE,
} from "./serializable-value";

export type SerializedComponent = Record<string, unknown>;

export type SerializedEntity = Readonly<{
	id: string;
	components: Record<string, SerializedComponent>;
}>;

export type SerializedWorld = ReadonlyArray<SerializedEntity>;

export type ComponentClass = new (...args: any[]) => object;

export type SerializableType = Readonly<{
	name: string;
	ctor: ComponentClass;
	fields: ReadonlyMap<string, SerializeOptions>;
	valueType: boolean;
}>;

const byName = new Map<string, SerializableType>();
const byCtor = new Map<ComponentClass, SerializableType>();

export const registerSerializable = (
	name: string,
	ctor: ComponentClass,
	fields: ReadonlyMap<string, SerializeOptions>,
): void => {
	const entry: SerializableType = {
		name,
		ctor,
		fields,
		valueType: VALUE_TYPE in ctor.prototype,
	};
	byName.set(name, entry);
	byCtor.set(ctor, entry);
};

export const serializableTypeName = (
	value: object,
): string | undefined =>
	byCtor.get(value.constructor as ComponentClass)?.name;

export const serializableType = (
	name: string,
): SerializableType | undefined => byName.get(name);

export const fieldOptions = (
	typeName: string,
	field: string,
): SerializeOptions | undefined =>
	byName.get(typeName)?.fields.get(field);

export const componentClass = (
	name: string,
): ComponentClass | undefined => byName.get(name)?.ctor;

export const registeredComponents = (): ReadonlyArray<
	readonly [string, ComponentClass]
> =>
	[...byName.values()]
		.filter((type) => !type.valueType)
		.map((type) => [type.name, type.ctor] as const);
