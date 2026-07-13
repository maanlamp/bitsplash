import type { UiAnchor } from "../reconciler/ui-elements";
import type { UiNode } from "../reconciler/ui-node";
import type { UiRoot } from "../reconciler/ui-root";
import type { DynStore } from "./dyn-store";

export interface AnchorCamera {
	worldToScreenX(x: number): number;
	worldToScreenY(y: number): number;
}

export type AnchorFrame = Readonly<{
	camera: AnchorCamera;
	uiScale: number;
	viewportWidth: number;
	viewportHeight: number;
}>;

export type AnchorOptions = {
	inset?: number;
};

const DEFAULT_INSET = 8;

const anchorOf = (node: UiNode): UiAnchor | undefined =>
	node.props.anchor as UiAnchor | undefined;

export class AnchorSystem {
	private readonly inset: number;

	constructor(
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
		options: AnchorOptions = {},
	) {
		this.inset = options.inset ?? DEFAULT_INSET;
	}

	update(frame: AnchorFrame): void {
		for (const child of this.root.tree.children) {
			this.walk(child, frame);
		}
	}

	private walk(node: UiNode, frame: AnchorFrame): void {
		const anchor = anchorOf(node);
		if (anchor) {
			this.project(node, anchor, frame);
		}
		for (const child of node.children) {
			this.walk(child, frame);
		}
	}

	private project(
		node: UiNode,
		anchor: UiAnchor,
		frame: AnchorFrame,
	): void {
		const dyn = this.dyn.get(node.id);
		const worldX = dyn?.worldX ?? anchor.world.x;
		const worldY = dyn?.worldY ?? anchor.world.y;
		const scale = frame.uiScale || 1;
		const uiX = frame.camera.worldToScreenX(worldX) / scale;
		const uiY = frame.camera.worldToScreenY(worldY) / scale;
		const width = frame.viewportWidth / scale;
		const height = frame.viewportHeight / scale;

		const onScreen =
			uiX >= 0 && uiX <= width && uiY >= 0 && uiY <= height;

		if (onScreen) {
			this.dyn.set(node.id, {
				offsetX: uiX,
				offsetY: uiY,
				rotation: 0,
				visible: true,
			});
			return;
		}

		if (!anchor.edgeClamp) {
			this.dyn.set(node.id, {
				offsetX: uiX,
				offsetY: uiY,
				visible: false,
			});
			return;
		}

		const clampedX = Math.max(
			this.inset,
			Math.min(width - this.inset, uiX),
		);
		const clampedY = Math.max(
			this.inset,
			Math.min(height - this.inset, uiY),
		);

		let towardX = uiX;
		let towardY = uiY;
		const point = anchor.pointToward;
		if (dyn?.targetX !== undefined && dyn?.targetY !== undefined) {
			towardX = frame.camera.worldToScreenX(dyn.targetX) / scale;
			towardY = frame.camera.worldToScreenY(dyn.targetY) / scale;
		} else if (point) {
			towardX = frame.camera.worldToScreenX(point.x) / scale;
			towardY = frame.camera.worldToScreenY(point.y) / scale;
		}

		this.dyn.set(node.id, {
			offsetX: clampedX,
			offsetY: clampedY,
			rotation: Math.atan2(towardY - clampedY, towardX - clampedX),
			visible: true,
		});
	}
}
