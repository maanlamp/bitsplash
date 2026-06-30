import { PhysicsBodyComponent } from "../../engine/components/physics-body";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { cssVar } from "../css-var";
import type { DebugFlags, DebugOverlay } from "../debug-flags";
import { entityGeometry, type GeometryRole } from "../pick";

export class PhysicsShapeDebugSystem implements RenderSystem {
	private flags: DebugFlags;
	private overlay: DebugOverlay;
	private role: GeometryRole;
	private layer: number;

	constructor(
		flags: DebugFlags,
		overlay: DebugOverlay,
		role: GeometryRole,
		layer: number,
	) {
		this.flags = flags;
		this.overlay = overlay;
		this.role = role;
		this.layer = layer;
	}

	render({ renderer, ecs, assetManager }: RenderContext): void {
		if (!this.flags.get(this.overlay.id)) {
			return;
		}
		const fill = cssVar(this.overlay.colorToken);
		for (const [id] of ecs.query(PhysicsBodyComponent)) {
			for (const piece of entityGeometry(ecs, id, assetManager)) {
				if (piece.role !== this.role) {
					continue;
				}
				renderer.drawRect(this.layer, {
					x: piece.center.x - piece.half.x,
					y: piece.center.y - piece.half.y,
					width: piece.half.x * 2,
					height: piece.half.y * 2,
					fill,
				});
			}
		}
	}
}
