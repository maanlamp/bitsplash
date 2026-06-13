import {
	collectFieldEnums,
	collectFileFields,
	collectMultilineFields,
} from "./field-enums";
import { type ComponentClass, registerComponent } from "./registry";

export const serializable =
	(typeName: string) =>
	(ctor: ComponentClass, context: ClassDecoratorContext): void => {
		registerComponent(typeName, ctor);
		collectFieldEnums(typeName, context.metadata);
		collectFileFields(typeName, context.metadata);
		collectMultilineFields(typeName, context.metadata);
	};
