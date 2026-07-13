import type { Style } from "../style/style";
import type { UiNode } from "./ui-node";

export interface YogaBridge {
	create(node: UiNode): void;
	free(node: UiNode): void;
	applyStyle(node: UiNode, style: Style): void;
}
