import { PhysicsBodyComponent } from "../../engine/components/physics-body";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tile";
import { TileGrid } from "../../engine/tilemap/grid";
import { UNSTUCK_SPEED } from "../constants";

export class TileUnstuckSystem implements UpdateSystem {
	private grid: TileGrid;

	constructor(grid: TileGrid) {
		this.grid = grid;
	}

	update({ ecs }: UpdateContext): void {
		for (const [, rb] of ecs.query(PhysicsBodyComponent)) {
			if (!rb.body || rb.body.isStatic) {
				continue;
			}
			const pos = rb.body.position;
			const gx = Math.floor(pos.x / TILE_SIZE);
			const gy = Math.floor(pos.y / TILE_SIZE);
			const stuck = this.grid.hasTile(gx, gy);

			this.setSensor(rb, stuck);
			if (!stuck) {
				continue;
			}

			const opening = this.nearestOpening(gx, gy);
			if (!opening) {
				continue;
			}

			const dx = (opening.gx + 0.5) * TILE_SIZE - pos.x;
			const dy = (opening.gy + 0.5) * TILE_SIZE - pos.y;
			const len = Math.hypot(dx, dy) || 1;
			rb.body.linearVelocity = {
				x: (dx / len) * UNSTUCK_SPEED,
				y: (dy / len) * UNSTUCK_SPEED,
			};
		}
	}

	private setSensor(rb: PhysicsBodyComponent, sensor: boolean): void {
		rb.body!.setSensor(sensor);
	}

	private nearestOpening(
		gx: number,
		gy: number,
	): Readonly<{ gx: number; gy: number }> | null {
		const neighbours = [
			[0, -1],
			[0, 1],
			[-1, 0],
			[1, 0],
		] as const;
		const visited = new Set<string>([`${gx},${gy}`]);
		const queue: Array<[number, number]> = [[gx, gy]];
		let head = 0;
		while (head < queue.length && visited.size < 256) {
			const [cx, cy] = queue[head++]!;
			if (!this.grid.hasTile(cx, cy)) {
				return { gx: cx, gy: cy };
			}
			for (const [dx, dy] of neighbours) {
				const nx = cx + dx;
				const ny = cy + dy;
				const k = `${nx},${ny}`;
				if (!visited.has(k)) {
					visited.add(k);
					queue.push([nx, ny]);
				}
			}
		}
		return null;
	}
}
