import { LocomotionComponent } from "../../engine/locomotion/locomotion-component";
import { NavAgentComponent } from "../../engine/nav/nav-agent-component";
import type { NavProfile } from "../../engine/nav/nav-graph-builder";
import { NavGraphComponent } from "../../engine/nav/nav-graph-component";
import {
	NavGraph,
	type NavEdge,
	type NavEdgeKind,
	nodeFeet,
} from "../../engine/nav/nav-graph";
import { resolveNavProfile } from "../../engine/nav/nav-profile";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import Vector2 from "../../engine/vector2";
import { cssVar } from "../css-var";
import type { DebugFlags } from "../debug-flags";
import type { EditorState } from "../editor-state";

const ARROW_SIZE = 7;
const ARROW_FLOW_SPEED = 28;
const EDGE_HEAD = 6;
const SIM_DT = 1 / 30;
const SIM_MAX_STEPS = 180;
const REACH_Y_DRAW = TILE_SIZE * 0.75;

type EdgeLine = { pts: Vector2[]; kind: NavEdgeKind };

export class NavGraphDebugSystem implements RenderSystem {
	private cacheGraph: NavGraph | null = null;
	private cacheMoveSpeed = -1;
	private cacheLines: EdgeLine[] = [];

	constructor(
		private readonly flags: DebugFlags,
		private readonly store: EditorState,
		private readonly layer: number,
	) {}

	render(ctx: RenderContext): void {
		const showGraph = this.flags.get("navGraph");
		const showPath = this.flags.get("navPath");
		if (!showGraph && !showPath) {
			return;
		}
		const comp = ctx.ecs.query(NavGraphComponent)[0]?.[1];
		if (!comp?.surface) {
			return;
		}
		const zoom = ctx.camera?.zoom ?? 1;
		const g = comp.gravity;
		if (showGraph) {
			const profile = this.selectedProfile(ctx, comp);
			const graph = profile ? comp.graphFor(profile) : null;
			if (graph && profile) {
				this.drawEdges(ctx, graph, g, profile.moveSpeed, zoom);
				this.drawNodes(ctx, graph, zoom);
			}
		}
		if (showPath) {
			this.drawPaths(ctx, g, zoom);
		}
	}

	private selectedProfile(
		ctx: RenderContext,
		comp: NavGraphComponent,
	): NavProfile | null {
		const id = this.store.primaryId;
		if (id === null) {
			return null;
		}
		const rb = ctx.ecs.getComponent(id, PhysicsBodyComponent);
		const capable =
			ctx.ecs.getComponent(id, NavAgentComponent) ??
			ctx.ecs.getComponent(id, LocomotionComponent);
		if (!rb || !capable) {
			return null;
		}
		const profile = resolveNavProfile(ctx.ecs, id, rb, comp.gravity);
		if (profile.jumpSpeed <= 0 && profile.moveSpeed <= 0) {
			return null;
		}
		return profile;
	}

	private edgePoints(
		from: Vector2,
		to: Vector2,
		edge: NavEdge | null,
		g: number,
		moveSpeed: number,
	): Vector2[] {
		const kind = edge?.kind ?? "walk";
		if (kind === "walk" || moveSpeed <= 0) {
			return [from, to];
		}
		const launchVy = edge?.launchVy ?? 0;
		const targetHigher = to.y < from.y - 0.5;
		const dir = Math.sign(to.x - from.x) || 1;
		let x = from.x;
		let y = from.y;
		let vy = -launchVy;
		const pts = [new Vector2(x, y)];
		for (let n = 0; n < SIM_MAX_STEPS; n++) {
			vy += g * SIM_DT;
			y += vy * SIM_DT;
			const canMove = !targetHigher || y <= to.y + REACH_Y_DRAW;
			if (canMove && x !== to.x) {
				const remaining = to.x - x;
				const stepX = dir * moveSpeed * SIM_DT;
				x = Math.abs(stepX) >= Math.abs(remaining) ? to.x : x + stepX;
			}
			if (vy > 0 && y >= to.y) {
				pts.push(new Vector2(to.x, to.y));
				break;
			}
			pts.push(new Vector2(x, y));
		}
		return pts;
	}

	private drawEdges(
		ctx: RenderContext,
		graph: NavGraph,
		g: number,
		moveSpeed: number,
		zoom: number,
	): void {
		if (
			this.cacheGraph !== graph ||
			this.cacheMoveSpeed !== moveSpeed
		) {
			const lines: EdgeLine[] = [];
			for (const node of graph.nodes) {
				const from = nodeFeet(node);
				for (const edge of graph.edges(node.id)) {
					const to = nodeFeet(graph.nodes[edge.to]!);
					lines.push({
						pts: this.edgePoints(from, to, edge, g, moveSpeed),
						kind: edge.kind,
					});
				}
			}
			this.cacheGraph = graph;
			this.cacheMoveSpeed = moveSpeed;
			this.cacheLines = lines;
		}
		const width = 1.5 / zoom;
		for (const line of this.cacheLines) {
			this.polyline(
				ctx,
				line.pts,
				edgeColor(line.kind),
				width,
				zoom,
				line.kind !== "walk",
			);
		}
	}

	private polyline(
		ctx: RenderContext,
		pts: Vector2[],
		color: string,
		width: number,
		zoom: number,
		head: boolean,
	): void {
		for (let i = 1; i < pts.length; i++) {
			this.line(ctx, pts[i - 1]!, pts[i]!, color, width);
		}
		if (!head) {
			return;
		}
		const tip = pts[pts.length - 1]!;
		const prev = pts[pts.length - 2] ?? tip;
		const dir = tip.clone().sub(prev);
		const len = dir.length();
		if (len < 0.5) {
			return;
		}
		dir.div(len);
		const perp = new Vector2(-dir.y, dir.x);
		const h = EDGE_HEAD / zoom;
		const baseX = tip.x - dir.x * h;
		const baseY = tip.y - dir.y * h;
		this.line(
			ctx,
			tip,
			new Vector2(baseX + perp.x * h * 0.6, baseY + perp.y * h * 0.6),
			color,
			width,
		);
		this.line(
			ctx,
			tip,
			new Vector2(baseX - perp.x * h * 0.6, baseY - perp.y * h * 0.6),
			color,
			width,
		);
	}

	private line(
		ctx: RenderContext,
		a: Vector2,
		b: Vector2,
		color: string,
		width: number,
	): void {
		ctx.renderer.drawLine(
			this.layer,
			a.x,
			a.y,
			b.x,
			b.y,
			color,
			width,
		);
	}

	private drawNodes(
		ctx: RenderContext,
		graph: NavGraph,
		zoom: number,
	): void {
		const color = cssVar("--debug-nav-node");
		const size = 4 / zoom;
		for (const node of graph.nodes) {
			const feet = nodeFeet(node);
			ctx.renderer.drawRect(this.layer, {
				x: feet.x - size / 2,
				y: feet.y - size / 2,
				width: size,
				height: size,
				fill: color,
			});
		}
	}

	private drawPaths(
		ctx: RenderContext,
		g: number,
		zoom: number,
	): void {
		const { renderer, ecs } = ctx;
		const pathColor = cssVar("--debug-nav-path");
		const targetColor = cssVar("--debug-nav-target");
		const width = 3.5 / zoom;
		const marker = 8 / zoom;
		const phase = (ctx.time.elapsed * ARROW_FLOW_SPEED) % TILE_SIZE;
		for (const [id, agent] of ecs.query(NavAgentComponent)) {
			if (agent.path.length < 2) {
				continue;
			}
			const rb = ecs.getComponent(id, PhysicsBodyComponent);
			const moveSpeed = rb
				? resolveNavProfile(ecs, id, rb, g).moveSpeed
				: 0;
			const pts: Vector2[] = [nodeFeet(agent.path[0]!.node)];
			for (let i = 1; i < agent.path.length; i++) {
				const from = nodeFeet(agent.path[i - 1]!.node);
				const to = nodeFeet(agent.path[i]!.node);
				const seg = this.edgePoints(
					from,
					to,
					agent.path[i]!.edge,
					g,
					moveSpeed,
				);
				for (let j = 1; j < seg.length; j++) {
					pts.push(seg[j]!);
				}
			}
			for (let i = 1; i < pts.length; i++) {
				this.line(ctx, pts[i - 1]!, pts[i]!, pathColor, width);
			}
			this.drawFlow(ctx, pts, pathColor, width, zoom, phase);
			const target = pts[pts.length - 1]!;
			renderer.drawRect(this.layer, {
				x: target.x - marker / 2,
				y: target.y - marker / 2,
				width: marker,
				height: marker,
				fill: targetColor,
			});
		}
	}

	private drawFlow(
		ctx: RenderContext,
		pts: Vector2[],
		color: string,
		width: number,
		zoom: number,
		phase: number,
	): void {
		let acc = 0;
		let next = phase;
		for (let i = 1; i < pts.length; i++) {
			const a = pts[i - 1]!;
			const b = pts[i]!;
			const segLen = b.distanceTo(a);
			if (segLen < 1e-4) {
				continue;
			}
			const dirX = (b.x - a.x) / segLen;
			const dirY = (b.y - a.y) / segLen;
			while (next <= acc + segLen) {
				const local = next - acc;
				this.arrowhead(
					ctx,
					a.x + dirX * local,
					a.y + dirY * local,
					dirX,
					dirY,
					color,
					width,
					zoom,
				);
				next += TILE_SIZE;
			}
			acc += segLen;
		}
	}

	private arrowhead(
		ctx: RenderContext,
		tipX: number,
		tipY: number,
		dirX: number,
		dirY: number,
		color: string,
		width: number,
		zoom: number,
	): void {
		const wing = ARROW_SIZE / zoom;
		const baseX = tipX - dirX * wing;
		const baseY = tipY - dirY * wing;
		const perpX = -dirY;
		const perpY = dirX;
		ctx.renderer.drawLine(
			this.layer,
			tipX,
			tipY,
			baseX + perpX * wing * 0.6,
			baseY + perpY * wing * 0.6,
			color,
			width,
		);
		ctx.renderer.drawLine(
			this.layer,
			tipX,
			tipY,
			baseX - perpX * wing * 0.6,
			baseY - perpY * wing * 0.6,
			color,
			width,
		);
	}
}

const edgeColor = (kind: NavEdgeKind): string => {
	switch (kind) {
		case "walk":
			return cssVar("--debug-nav-edge-walk");
		case "fall":
			return cssVar("--debug-nav-edge-fall");
		case "jump":
			return cssVar("--debug-nav-edge-jump");
	}
};
