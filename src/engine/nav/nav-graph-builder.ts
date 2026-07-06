import { TILE_SIZE } from "../tilemap/tile";
import { NavGraph, type NavEdge, type NavNode } from "./nav-graph";
import type { NavSurface } from "./nav-surface";

export type NavProfile = Readonly<{
	halfWidth: number;
	heightPx: number;
	jumpSpeed: number;
	moveSpeed: number;
	maxDropHeight: number;
	gravity: number;
}>;

export const DEFAULT_DEBUG_PROFILE: NavProfile = {
	halfWidth: TILE_SIZE / 2,
	heightPx: TILE_SIZE,
	jumpSpeed: 320,
	moveSpeed: 96,
	maxDropHeight: 8 * TILE_SIZE,
	gravity: 640,
};

const EPS = 0.001;
const JUMP_APEX_MARGIN = 12;
const JUMP_PENALTY = TILE_SIZE;
const JUMP_TIME_MARGIN = 0.9;
const JUMP_SPEED_STEPS = 12;
const SAMPLE_STEP = 6;
const MAX_FALL_TILES = 8;

// Box occupying [cx-hw, cx+hw) x [feetY-heightPx, feetY): does it overlap any
// solid cell? Right/bottom edges are exclusive so flush contact with a wall or
// the support surface is NOT counted as a collision.
const boxBlocked = (
	surface: NavSurface,
	cx: number,
	feetY: number,
	halfWidth: number,
	heightPx: number,
): boolean => {
	const gx0 = Math.floor((cx - halfWidth) / TILE_SIZE);
	const gx1 = Math.floor((cx + halfWidth - EPS) / TILE_SIZE);
	const gy0 = Math.floor((feetY - heightPx) / TILE_SIZE);
	const gy1 = Math.floor((feetY - EPS) / TILE_SIZE);
	for (let gy = gy0; gy <= gy1; gy++) {
		for (let gx = gx0; gx <= gx1; gx++) {
			if (surface.blocksAt(gx, gy)) {
				return true;
			}
		}
	}
	return false;
};

const cellCenterX = (gx: number): number => (gx + 0.5) * TILE_SIZE;
const cellFeetY = (gy: number): number => (gy + 1) * TILE_SIZE;

const isStanding = (
	surface: NavSurface,
	gx: number,
	gy: number,
	p: NavProfile,
): boolean =>
	surface.supportAt(gx, gy + 1) === "solid" &&
	!boxBlocked(
		surface,
		cellCenterX(gx),
		cellFeetY(gy),
		p.halfWidth,
		p.heightPx,
	);

// Sweep the box along a straight segment; false if any sample collides.
const segmentClear = (
	surface: NavSurface,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	p: NavProfile,
): boolean => {
	const dist = Math.hypot(x1 - x0, y1 - y0);
	const steps = Math.max(1, Math.ceil(dist / SAMPLE_STEP));
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const x = x0 + (x1 - x0) * t;
		const y = y0 + (y1 - y0) * t;
		if (boxBlocked(surface, x, y, p.halfWidth, p.heightPx)) {
			return false;
		}
	}
	return true;
};

export const buildNavGraph = (
	surface: NavSurface,
	profile: NavProfile,
	version = 0,
): NavGraph => {
	const bounds = surface.bounds();
	const nodes: NavNode[] = [];
	const idByCell = new Map<string, number>();
	if (!bounds) {
		return new NavGraph(version, nodes, new Map());
	}

	const g = profile.gravity;
	const maxJumpHeight =
		(profile.jumpSpeed * profile.jumpSpeed) / (2 * g);
	const maxUpTiles = Math.floor(maxJumpHeight / TILE_SIZE);
	const maxDropTiles = Math.min(
		MAX_FALL_TILES,
		Math.floor(profile.maxDropHeight / TILE_SIZE),
	);
	const flatAirtime = (2 * profile.jumpSpeed) / g;
	const maxReachTiles = Math.max(
		1,
		Math.ceil((profile.moveSpeed * flatAirtime) / TILE_SIZE) + 1,
	);

	for (let gy = bounds.minY - 1; gy <= bounds.maxY + 1; gy++) {
		for (let gx = bounds.minX - 1; gx <= bounds.maxX + 1; gx++) {
			if (!isStanding(surface, gx, gy, profile)) {
				continue;
			}
			const id = nodes.length;
			nodes.push({ id, gx, gy });
			idByCell.set(`${gx},${gy}`, id);
		}
	}

	const edgeMap = new Map<number, NavEdge[]>();
	const push = (from: number, edge: NavEdge): void => {
		const list = edgeMap.get(from);
		if (list) {
			list.push(edge);
		} else {
			edgeMap.set(from, [edge]);
		}
	};
	const nodeAt = (gx: number, gy: number): NavNode | null => {
		const id = idByCell.get(`${gx},${gy}`);
		return id === undefined ? null : nodes[id]!;
	};

	for (const node of nodes) {
		buildWalk(surface, node, nodeAt, push, profile);
		buildFall(surface, node, nodeAt, push, profile, maxDropTiles);
		buildJump(
			surface,
			node,
			nodeAt,
			push,
			profile,
			maxUpTiles,
			maxDropTiles,
			maxReachTiles,
		);
	}

	return new NavGraph(version, nodes, edgeMap);
};

type NodeLookup = (gx: number, gy: number) => NavNode | null;
type Push = (from: number, edge: NavEdge) => void;

const buildWalk = (
	surface: NavSurface,
	node: NavNode,
	nodeAt: NodeLookup,
	push: Push,
	p: NavProfile,
): void => {
	for (const dir of [-1, 1]) {
		const neighbor = nodeAt(node.gx + dir, node.gy);
		if (!neighbor) {
			continue;
		}
		const y = cellFeetY(node.gy);
		if (
			!segmentClear(
				surface,
				cellCenterX(node.gx),
				y,
				cellCenterX(neighbor.gx),
				y,
				p,
			)
		) {
			continue;
		}
		push(node.id, {
			to: neighbor.id,
			kind: "walk",
			cost: TILE_SIZE,
			launchVy: 0,
			moveScale: 1,
		});
	}
};

const buildFall = (
	surface: NavSurface,
	node: NavNode,
	nodeAt: NodeLookup,
	push: Push,
	p: NavProfile,
	maxDropTiles: number,
): void => {
	for (const dir of [-1, 1]) {
		const cgx = node.gx + dir;
		if (surface.blocksAt(cgx, node.gy) || nodeAt(cgx, node.gy)) {
			continue;
		}
		for (let k = 1; k <= maxDropTiles; k++) {
			const cgy = node.gy + k;
			if (surface.blocksAt(cgx, cgy)) {
				break;
			}
			const landing = nodeAt(cgx, cgy);
			if (!landing) {
				continue;
			}
			const ok =
				segmentClear(
					surface,
					cellCenterX(node.gx),
					cellFeetY(node.gy),
					cellCenterX(cgx),
					cellFeetY(node.gy),
					p,
				) &&
				segmentClear(
					surface,
					cellCenterX(cgx),
					cellFeetY(node.gy),
					cellCenterX(cgx),
					cellFeetY(cgy),
					p,
				);
			if (ok) {
				push(node.id, {
					to: landing.id,
					kind: "fall",
					cost: TILE_SIZE + k * TILE_SIZE * 0.5,
					launchVy: 0,
					moveScale: 1,
				});
			}
			break;
		}
	}
};

const flatWalkable = (
	nodeAt: NodeLookup,
	node: NavNode,
	dgx: number,
): boolean => {
	const step = Math.sign(dgx);
	for (let k = 1; k <= Math.abs(dgx); k++) {
		if (!nodeAt(node.gx + step * k, node.gy)) {
			return false;
		}
	}
	return true;
};

const buildJump = (
	surface: NavSurface,
	node: NavNode,
	nodeAt: NodeLookup,
	push: Push,
	p: NavProfile,
	maxUpTiles: number,
	maxDownTiles: number,
	maxReachTiles: number,
): void => {
	const aFeetY = cellFeetY(node.gy);
	for (let dgx = -maxReachTiles; dgx <= maxReachTiles; dgx++) {
		if (dgx === 0) {
			continue;
		}
		for (let dgy = -maxUpTiles; dgy <= maxDownTiles; dgy++) {
			const target = nodeAt(node.gx + dgx, node.gy + dgy);
			if (!target) {
				continue;
			}
			if (Math.abs(dgx) === 1 && dgy >= 0) {
				continue;
			}
			if (dgy === 0 && flatWalkable(nodeAt, node, dgx)) {
				continue;
			}
			const dx = Math.abs(dgx) * TILE_SIZE;
			const deltaY = cellFeetY(node.gy + dgy) - aFeetY;
			const riseHeight = Math.max(0, -deltaY);
			const vJump = solveJump(
				surface,
				node.gx,
				node.gy,
				dgx,
				dgy,
				dx,
				deltaY,
				riseHeight,
				p,
			);
			if (vJump === null) {
				continue;
			}
			push(node.id, {
				to: target.id,
				kind: "jump",
				cost: dx + riseHeight + JUMP_PENALTY,
				launchVy: vJump,
				moveScale: 1,
			});
		}
	}
};

const solveJump = (
	surface: NavSurface,
	agx: number,
	agy: number,
	dgx: number,
	dgy: number,
	dx: number,
	deltaY: number,
	riseHeight: number,
	p: NavProfile,
): number | null => {
	const g = p.gravity;
	const vMin = Math.sqrt(2 * g * (riseHeight + JUMP_APEX_MARGIN));
	if (vMin > p.jumpSpeed) {
		return null;
	}
	for (let i = 0; i <= JUMP_SPEED_STEPS; i++) {
		const vJump =
			vMin + ((p.jumpSpeed - vMin) * i) / JUMP_SPEED_STEPS;
		const disc = vJump * vJump + 2 * g * deltaY;
		if (disc < 0) {
			continue;
		}
		const airtime = (vJump + Math.sqrt(disc)) / g;
		if (
			airtime <= 0 ||
			p.moveSpeed * airtime * JUMP_TIME_MARGIN < dx
		) {
			continue;
		}
		if (jumpPathClear(surface, agx, agy, dgx, dgy, vJump, p)) {
			return vJump;
		}
	}
	return null;
};

const jumpPathClear = (
	surface: NavSurface,
	agx: number,
	agy: number,
	dgx: number,
	dgy: number,
	vJump: number,
	p: NavProfile,
): boolean => {
	const apexHeight = (vJump * vJump) / (2 * p.gravity);
	const ax = cellCenterX(agx);
	const aFeetY = cellFeetY(agy);
	const bx = cellCenterX(agx + dgx);
	const bFeetY = cellFeetY(agy + dgy);
	const traverseY = Math.min(aFeetY, bFeetY) - JUMP_APEX_MARGIN;
	if (aFeetY - traverseY > apexHeight) {
		return false;
	}
	return (
		segmentClear(surface, ax, aFeetY, ax, traverseY, p) &&
		segmentClear(surface, ax, traverseY, bx, traverseY, p) &&
		segmentClear(surface, bx, traverseY, bx, bFeetY, p)
	);
};
