import { componentTypeName } from "../engine/serialization/registry";

export const componentLabel = (component: object): string =>
	componentTypeName(component) ??
	component.constructor.name.replace(/Component$/, "");
