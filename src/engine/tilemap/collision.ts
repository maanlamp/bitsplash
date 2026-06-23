import type { RigidBody } from "../physics/rigid-body";
import { TILE_SIZE } from "../tile";
import type { World } from "../world";
import type { TileGrid } from "./grid";

type Point = Readonly<{
	x: number;
	y: number;
}>;

export class TileCollisionBaker {
	private grid: TileGrid;
	private world: World;
	private layer: string | undefined;
	private bodies: RigidBody[] = [];

	constructor(grid: TileGrid, world: World, layer?: string) {
		this.grid = grid;
		this.world = world;
		this.layer = layer;
		grid.onChange(() => this.rebuild());
	}

	private rebuild(): void {
		for (const body of this.bodies) {
			this.world.destroyBody(body);
		}
		this.bodies = [];

		for (const loop of this.traceLoops()) {
			if (loop.length < 3) {
				continue;
			}
			const body = this.world.createStaticChain(
				loop.map((p) => ({
					x: p.x * TILE_SIZE,
					y: p.y * TILE_SIZE,
				})),
				0.5,
				this.layer,
			);
			this.bodies.push(body);
		}
	}

	private traceLoops(): Point[][] {
		const edges = new Map<string, Point[]>();
		const add = (a: Point, b: Point): void => {
			const k = `${a.x},${a.y}`;
			const list = edges.get(k);
			if (list) {
				list.push(b);
			} else {
				edges.set(k, [b]);
			}
		};

		for (const [gx, gy] of this.grid.occupiedCells()) {
			const tl = { x: gx, y: gy };
			const tr = { x: gx + 1, y: gy };
			const br = { x: gx + 1, y: gy + 1 };
			const bl = { x: gx, y: gy + 1 };
			if (!this.grid.hasTile(gx, gy - 1)) {
				add(tl, tr);
			}
			if (!this.grid.hasTile(gx + 1, gy)) {
				add(tr, br);
			}
			if (!this.grid.hasTile(gx, gy + 1)) {
				add(br, bl);
			}
			if (!this.grid.hasTile(gx - 1, gy)) {
				add(bl, tl);
			}
		}

		const loops: Point[][] = [];
		for (const startKey of edges.keys()) {
			while ((edges.get(startKey)?.length ?? 0) > 0) {
				const loop: Point[] = [];
				let cur: Point = this.parsePoint(startKey);
				let curKey = startKey;
				do {
					loop.push(cur);
					const next = edges.get(curKey)?.pop();
					if (!next) {
						break;
					}
					cur = next;
					curKey = `${next.x},${next.y}`;
				} while (curKey !== startKey);
				loops.push(this.collapseColinear(loop));
			}
		}
		return loops;
	}

	private parsePoint(key: string): Point {
		const [x, y] = key.split(",").map(Number) as [number, number];
		return { x, y };
	}

	private collapseColinear(loop: Point[]): Point[] {
		const n = loop.length;
		if (n < 3) {
			return loop;
		}
		const out: Point[] = [];
		for (let i = 0; i < n; i++) {
			const prev = loop[(i - 1 + n) % n]!;
			const cur = loop[i]!;
			const next = loop[(i + 1) % n]!;
			const cross =
				(cur.x - prev.x) * (next.y - cur.y) -
				(cur.y - prev.y) * (next.x - cur.x);
			if (cross !== 0) {
				out.push(cur);
			}
		}
		return out;
	}
}
