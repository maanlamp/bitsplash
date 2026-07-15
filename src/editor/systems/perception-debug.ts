import { FacingComponent } from "../../engine/locomotion/facing-component";
import { PerceptionComponent } from "../../engine/perception/perception-component";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { cssVar } from "../css-var";
import type { DebugFlags } from "../debug-flags";

const ARC_SEGMENTS = 16;
const FAN_RAYS = 6;

const coneColor = (detection: number): string =>
	`oklch(0.72 0.2 ${70 - 45 * detection} / ${0.28 + 0.5 * detection})`;

const point = (
	eye: Vector2,
	angle: number,
	radius: number,
): Vector2 => Vector2.fromAngle(angle).mul(radius).add(eye);

export class PerceptionDebugSystem implements RenderSystem {
	constructor(
		private readonly flags: DebugFlags,
		private readonly layer: number,
	) {}

	render(ctx: RenderContext): void {
		if (!this.flags.get("perception")) {
			return;
		}
		const zoom = ctx.camera?.zoom ?? 1;
		const width = 1.5 / zoom;
		for (const [, perception, transform, facing] of ctx.ecs.query(
			PerceptionComponent,
			TransformComponent,
			FacingComponent,
		)) {
			this.drawCone(ctx, perception, transform, facing, width);
			this.drawStimulus(ctx, perception, transform, zoom, width);
		}
	}

	private drawCone(
		ctx: RenderContext,
		perception: PerceptionComponent,
		transform: TransformComponent,
		facing: FacingComponent,
		width: number,
	): void {
		const eye = transform.position;
		const range = perception.viewDistanceTiles * TILE_SIZE;
		const half = perception.viewAngle.radians;
		const aim = facing.dir < 0 ? Math.PI : 0;
		const a0 = aim - half;
		const a1 = aim + half;
		const color = coneColor(perception.detection);

		this.line(ctx, eye, point(eye, a0, range), color, width);
		this.line(ctx, eye, point(eye, a1, range), color, width);
		for (let i = 1; i < FAN_RAYS; i++) {
			const a = a0 + ((a1 - a0) * i) / FAN_RAYS;
			this.line(ctx, eye, point(eye, a, range), color, width * 0.5);
		}
		this.arc(ctx, eye, a0, a1, range, color, width);

		if (perception.detection > 0.02) {
			this.arc(
				ctx,
				eye,
				a0,
				a1,
				range * perception.detection,
				color,
				width * 1.5,
			);
		}
	}

	private arc(
		ctx: RenderContext,
		eye: Vector2,
		a0: number,
		a1: number,
		radius: number,
		color: string,
		width: number,
	): void {
		let prev = point(eye, a0, radius);
		for (let i = 1; i <= ARC_SEGMENTS; i++) {
			const a = a0 + ((a1 - a0) * i) / ARC_SEGMENTS;
			const next = point(eye, a, radius);
			this.line(ctx, prev, next, color, width);
			prev = next;
		}
	}

	private drawStimulus(
		ctx: RenderContext,
		perception: PerceptionComponent,
		transform: TransformComponent,
		zoom: number,
		width: number,
	): void {
		const eye = transform.position;
		const clear = cssVar("--debug-perception-ray-clear");
		const blocked = cssVar("--debug-perception-ray-blocked");
		const dot = 3 / zoom;
		for (const sample of perception.sightSamples) {
			const color = sample.blocked ? blocked : clear;
			this.line(
				ctx,
				eye,
				new Vector2(sample.x, sample.y),
				color,
				width,
			);
			ctx.renderer.drawRect(this.layer, {
				x: sample.x - dot / 2,
				y: sample.y - dot / 2,
				width: dot,
				height: dot,
				fill: color,
			});
		}

		const stimulus = perception.lastStimulusPos;
		if (stimulus) {
			const size = 6 / zoom;
			ctx.renderer.drawRect(this.layer, {
				x: stimulus.x - size / 2,
				y: stimulus.y - size / 2,
				width: size,
				height: size,
				fill: cssVar("--debug-perception-stimulus"),
			});
		}
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
}
