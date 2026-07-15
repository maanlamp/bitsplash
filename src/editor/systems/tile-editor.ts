import type { EntityId } from "../../engine/ecs";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import type { TileGrid } from "../../engine/tilemap/grid";
import { activeTileLayer } from "../active-layer";
import { FLOOD_FILL_CELL_CAP } from "../constants";
import type { EditorState } from "../editor-state";
import type { SceneDocument } from "../scene-document";
import { bresenham } from "../line";

type Cell = Readonly<{
	gx: number;
	gy: number;
}>;

type PendingAction = {
	layerId: EntityId;
	added: Cell[];
	removed: Cell[];
};

export class TileEditorSystem implements UpdateSystem {
	private editor: EditorState;
	private document: SceneDocument;

	private layerId: EntityId | null = null;
	private grid: TileGrid | null = null;

	private prevLeft = false;
	private brushPrev: Cell | null = null;
	private lassoActive = false;
	private lassoStart: Cell = { gx: 0, gy: 0 };
	private lassoCells: Cell[] = [];
	private lassoSeen = new Set<string>();
	private pending: PendingAction | null = null;

	constructor(editor: EditorState, document: SceneDocument) {
		this.editor = editor;
		this.document = document;
	}

	/** Commit any open tile stroke as a journal entry — a save gesture boundary. */
	flush(): void {
		this.commitAction();
	}

	private beginAction(): void {
		if (!this.pending && this.layerId !== null) {
			this.pending = {
				layerId: this.layerId,
				added: [],
				removed: [],
			};
		}
	}

	private commitAction(): void {
		const pending = this.pending;
		this.pending = null;
		if (
			!pending ||
			(pending.added.length === 0 && pending.removed.length === 0)
		) {
			return;
		}
		this.document.recordApplied({
			kind: "tile-op",
			layerId: pending.layerId,
			added: pending.added,
			removed: pending.removed,
		});
	}

	update({ ecs, input, camera }: UpdateContext): void {
		const entry = activeTileLayer(ecs, this.editor);
		if (!entry) {
			this.commitAction();
			this.layerId = null;
			this.grid = null;
			this.brushPrev = null;
			this.lassoActive = false;
			return;
		}
		if (entry[0] !== this.layerId) {
			this.commitAction();
			this.brushPrev = null;
			this.lassoActive = false;
		}
		this.layerId = entry[0];
		this.grid = entry[1].grid;

		if (!camera) {
			return;
		}
		const left = input.mouse.buttons.left ?? false;
		const world = camera.screenToWorld(input.mouse.position);
		const gx = Math.floor(world.x / TILE_SIZE);
		const gy = Math.floor(world.y / TILE_SIZE);
		const leftPressed = left && !this.prevLeft;
		const leftReleased = !left && this.prevLeft;

		if (
			this.editor.mode !== "paint" &&
			this.editor.mode !== "eraser" &&
			this.editor.mode !== "lasso"
		) {
			this.brushPrev = null;
		}
		if (this.editor.mode !== "lasso") {
			this.lassoActive = false;
		}

		switch (this.editor.mode) {
			case "paint":
				this.brush(gx, gy, left, true);
				break;
			case "eraser":
				this.brush(gx, gy, left, false);
				break;
			case "fill":
				if (leftPressed) {
					this.beginAction();
					this.flood(gx, gy, !entry[1].grid.hasTile(gx, gy));
					this.commitAction();
				}
				break;
			case "lasso":
				this.lasso(gx, gy, leftPressed, leftReleased);
				break;
		}

		this.prevLeft = left;
	}

	private stroke(
		cur: Cell,
		add: boolean,
		onCell?: (c: Cell) => void,
	): void {
		for (const c of this.lineCells(this.brushPrev ?? cur, cur)) {
			onCell?.(c);
			this.applyCell(c, add);
		}
		this.brushPrev = cur;
	}

	private brush(
		gx: number,
		gy: number,
		active: boolean,
		add: boolean,
	): void {
		const cur: Cell = { gx, gy };
		if (!active) {
			this.brushPrev = null;
			this.commitAction();
			return;
		}
		this.beginAction();
		this.stroke(cur, add);
	}

	private lasso(
		gx: number,
		gy: number,
		leftPressed: boolean,
		leftReleased: boolean,
	): void {
		const cur: Cell = { gx, gy };
		if (!this.lassoActive) {
			if (!leftPressed) {
				return;
			}
			this.lassoActive = true;
			this.beginAction();
			this.brushPrev = cur;
			this.lassoStart = cur;
			this.lassoCells = [];
			this.lassoSeen = new Set();
		}

		const record = (c: Cell) => this.recordLassoCell(c);
		this.stroke(cur, true, record);

		if (leftReleased) {
			this.stroke(this.lassoStart, true, record);
			for (const c of this.lassoInterior()) {
				this.applyCell(c, true);
			}
			this.commitAction();
			this.lassoActive = false;
			this.brushPrev = null;
		}
	}

	private recordLassoCell(c: Cell): void {
		const k = `${c.gx},${c.gy}`;
		if (!this.lassoSeen.has(k)) {
			this.lassoSeen.add(k);
			this.lassoCells.push(c);
		}
	}

	private applyCell(c: Cell, add: boolean): void {
		const grid = this.grid;
		if (!grid) {
			return;
		}
		if (add) {
			if (!grid.hasTile(c.gx, c.gy)) {
				grid.setTile(c.gx, c.gy);
				this.pending?.added.push(c);
			}
		} else if (grid.hasTile(c.gx, c.gy)) {
			grid.removeTile(c.gx, c.gy);
			this.pending?.removed.push(c);
		}
	}

	private lassoInterior(): Cell[] {
		if (this.lassoCells.length === 0) {
			return [];
		}
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		for (const c of this.lassoCells) {
			minX = Math.min(minX, c.gx);
			maxX = Math.max(maxX, c.gx);
			minY = Math.min(minY, c.gy);
			maxY = Math.max(maxY, c.gy);
		}

		const x0 = minX - 1;
		const x1 = maxX + 1;
		const y0 = minY - 1;
		const y1 = maxY + 1;
		const outside = new Set<string>();
		const queue: Cell[] = [{ gx: x0, gy: y0 }];
		outside.add(`${x0},${y0}`);
		const neighbours = [
			[0, -1],
			[0, 1],
			[-1, 0],
			[1, 0],
		] as const;
		let head = 0;
		while (head < queue.length) {
			const c = queue[head++]!;
			for (const [dx, dy] of neighbours) {
				const nx = c.gx + dx;
				const ny = c.gy + dy;
				if (nx < x0 || nx > x1 || ny < y0 || ny > y1) {
					continue;
				}
				const k = `${nx},${ny}`;
				if (outside.has(k) || this.lassoSeen.has(k)) {
					continue;
				}
				outside.add(k);
				queue.push({ gx: nx, gy: ny });
			}
		}

		const interior: Cell[] = [];
		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				const k = `${x},${y}`;
				if (!this.lassoSeen.has(k) && !outside.has(k)) {
					interior.push({ gx: x, gy: y });
				}
			}
		}
		return interior;
	}

	private flood(gx: number, gy: number, add: boolean): void {
		const grid = this.grid;
		if (!grid) {
			return;
		}
		const fillState = !add;
		if (grid.hasTile(gx, gy) !== fillState) {
			return;
		}

		const neighbours = [
			[0, -1],
			[0, 1],
			[-1, 0],
			[1, 0],
		] as const;
		const visited = new Set<string>([`${gx},${gy}`]);
		const queue: Cell[] = [{ gx, gy }];
		let head = 0;
		while (head < queue.length) {
			if (queue.length > FLOOD_FILL_CELL_CAP) {
				return;
			}
			const c = queue[head++]!;
			for (const [dx, dy] of neighbours) {
				const nx = c.gx + dx;
				const ny = c.gy + dy;
				const k = `${nx},${ny}`;
				if (visited.has(k)) {
					continue;
				}
				if (grid.hasTile(nx, ny) !== fillState) {
					continue;
				}
				visited.add(k);
				queue.push({ gx: nx, gy: ny });
			}
		}

		for (const c of queue) {
			this.applyCell(c, add);
		}
	}

	private lineCells(a: Cell, b: Cell): Cell[] {
		const out: Cell[] = [];
		bresenham(a.gx, a.gy, b.gx, b.gy, (gx, gy) => {
			out.push({ gx, gy });
		});
		return out;
	}
}
