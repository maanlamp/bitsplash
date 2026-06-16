import {
	collectFieldEnums,
	collectFileFields,
	collectMultilineFields,
	collectRequiredFields,
	collectSkipFields,
} from "./field-enums";
import {
	registerValueType,
	type ValueTypeAdapter,
} from "./value-type-registry";

export function valueType<T extends object>(
	adapter: ValueTypeAdapter<T>,
): (
	ctor: abstract new (...args: never[]) => T,
	context: ClassDecoratorContext,
) => void;
export function valueType<T extends object>(): (
	ctor: new () => T,
	context: ClassDecoratorContext,
) => void;
export function valueType<T extends object>(
	adapter?: ValueTypeAdapter<T>,
) {
	return (
		ctor: abstract new (...args: never[]) => T,
		context: ClassDecoratorContext,
	): void => {
		if (adapter) {
			registerValueType(
				ctor as abstract new (...args: never[]) => T,
				adapter,
			);
		} else {
			registerValueType(ctor as new () => T);
		}
		const name = String(context.name);
		collectFieldEnums(name, context.metadata);
		collectFileFields(name, context.metadata);
		collectMultilineFields(name, context.metadata);
		collectRequiredFields(name, context.metadata);
		collectSkipFields(name, context.metadata);
	};
}
