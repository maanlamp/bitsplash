import { componentTypeName } from "../engine/serialization/registry";
import { toSentenceCase } from "./text-case";

export const componentLabel = (component: object): string =>
	toSentenceCase(
		componentTypeName(component) ??
			component.constructor.name.replace(/Component$/, ""),
	);
