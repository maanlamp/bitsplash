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

export type SerializableOptions = {
	runtime?: boolean;
};

export const serializable =
	(name: string, options: SerializableOptions = {}) =>
	(ctor: ComponentClass, context: ClassDecoratorContext): void => {
		registerSerializable(
			name,
			ctor,
			fieldsOf(context.metadata),
			options.runtime ?? false,
		);
	};

export const serialize =
	(options: SerializeOptions = {}) =>
	<V extends SerializableValue>(
		_value: unknown,
		context:
			| ClassFieldDecoratorContext<unknown, V>
			| ClassGetterDecoratorContext<unknown, V>,
	): void => {
		fieldsOf(context.metadata).set(String(context.name), options);
	};
