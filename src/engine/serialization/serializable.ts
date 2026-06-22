import {
	type ComponentClass,
	registerSerializable,
} from "./registry";
import type {
	SerializableValue,
	SerializeOptions,
} from "./serializable-value";

type FieldMeta = {
	serializedFields?: Map<string, SerializeOptions>;
};

const fieldsOf = (
	metadata: DecoratorMetadata,
): Map<string, SerializeOptions> => {
	const meta = metadata as FieldMeta;
	return (meta.serializedFields ??= new Map());
};

export const serializable =
	(name: string) =>
	(ctor: ComponentClass, context: ClassDecoratorContext): void => {
		registerSerializable(name, ctor, fieldsOf(context.metadata));
	};

export const serialize =
	(options: SerializeOptions = {}) =>
	<V extends SerializableValue>(
		_value: undefined,
		context: ClassFieldDecoratorContext<unknown, V>,
	): void => {
		fieldsOf(context.metadata).set(String(context.name), options);
	};
