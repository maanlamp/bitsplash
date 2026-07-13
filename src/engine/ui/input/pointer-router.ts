import type { UiNode } from "../reconciler/ui-node";
import { clips, pointerEventsOf, rectContains } from "./node-tree";

export type UiPoint = { x: number; y: number };

export class PointerRouter {
	toUiSpace(x: number, y: number, uiScale: number): UiPoint {
		const scale = uiScale > 0 ? uiScale : 1;
		return { x: x / scale, y: y / scale };
	}

	hitTest(root: UiNode, x: number, y: number): UiNode | null {
		let hit: UiNode | null = null;
		const visit = (node: UiNode, transparent: boolean): void => {
			const rect = node.layoutRect;
			const inside = rect ? rectContains(rect, x, y) : false;
			if (rect && clips(node) && !inside) {
				return;
			}
			const pe = pointerEventsOf(node);
			const nodeTransparent =
				pe === undefined ? transparent : pe === "none";
			if (inside && !nodeTransparent && node.type !== "#root") {
				hit = node;
			}
			for (const child of node.children) {
				visit(child, nodeTransparent);
			}
		};
		visit(root, false);
		return hit;
	}
}
