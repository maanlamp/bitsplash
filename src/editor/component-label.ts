import { serializableTypeName } from "../engine/serialization/registry";
import { toSentenceCase } from "./text-case";

export const componentLabel = (component: object): string =>
	toSentenceCase(
		serializableTypeName(component) ??
			component.constructor.name.replace(/Component$/, ""),
	);
