import type { RenderTarget } from "../render/render-target";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";
import Vector2, { type ReadonlyVector2 } from "../vector2";

export type Bounds = Readonly<{ min: Vector2; max: Vector2 }>;

@serializable("Camera2DState")
export class Camera2D implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() position: Vector2;
	shake: Vector2 = Vector2.zero();
	@serialize() zoom: number;
	viewportWidth = 0;
	viewportHeight = 0;
	minZoom: number;
	maxZoom: number;
	target: RenderTarget | null = null;

	constructor(
		position: Vector2 = Vector2.zero(),
		zoom: number = 3,
		minZoom: number = 0.25,
		maxZoom: number = 16,
	) {
		this.position = position;
		this.zoom = zoom;
		this.minZoom = minZoom;
		this.maxZoom = maxZoom;
	}

	screenToWorld(screen: ReadonlyVector2, out?: Vector2): Vector2 {
		const x =
			(screen.x - this.viewportWidth / 2) / this.zoom +
			this.position.x;
		const y =
			(screen.y - this.viewportHeight / 2) / this.zoom +
			this.position.y;
		return out ? out.set(x, y) : new Vector2(x, y);
	}

	worldToScreen(world: Vector2, out?: Vector2): Vector2 {
		const x =
			(world.x - this.position.x) * this.zoom +
			this.viewportWidth / 2;
		const y =
			(world.y - this.position.y) * this.zoom +
			this.viewportHeight / 2;
		return out ? out.set(x, y) : new Vector2(x, y);
	}

	worldToScreenX(x: number): number {
		return (x - this.position.x) * this.zoom + this.viewportWidth / 2;
	}

	worldToScreenY(y: number): number {
		return (
			(y - this.position.y) * this.zoom + this.viewportHeight / 2
		);
	}

	visibleBounds(): Bounds {
		const halfW = this.viewportWidth / 2 / this.zoom;
		const halfH = this.viewportHeight / 2 / this.zoom;
		return {
			min: new Vector2(
				this.position.x - halfW,
				this.position.y - halfH,
			),
			max: new Vector2(
				this.position.x + halfW,
				this.position.y + halfH,
			),
		};
	}

	clampZoom(): void {
		this.zoom = Math.max(
			this.minZoom,
			Math.min(this.maxZoom, this.zoom),
		);
	}

	zoomToFit(min: Vector2, max: Vector2, padding: number): number {
		if (this.viewportWidth <= 0 || this.viewportHeight <= 0) {
			return this.zoom;
		}
		const worldW = max.x - min.x + padding * 2;
		const worldH = max.y - min.y + padding * 2;
		const zx =
			worldW > 0 ? this.viewportWidth / worldW : this.maxZoom;
		const zy =
			worldH > 0 ? this.viewportHeight / worldH : this.maxZoom;
		return Math.max(
			this.minZoom,
			Math.min(this.maxZoom, Math.min(zx, zy)),
		);
	}

	fitBounds(min: Vector2, max: Vector2, padding: number): void {
		this.zoom = this.zoomToFit(min, max, padding);
		this.position.set((min.x + max.x) / 2, (min.y + max.y) / 2);
	}

	confineTo(bounds: Bounds): void {
		const halfW = this.viewportWidth / 2 / this.zoom;
		const halfH = this.viewportHeight / 2 / this.zoom;
		const extentX = bounds.max.x - bounds.min.x;
		const extentY = bounds.max.y - bounds.min.y;

		if (extentX <= halfW * 2) {
			this.position.x = (bounds.min.x + bounds.max.x) / 2;
		} else {
			this.position.x = Math.max(
				bounds.min.x + halfW,
				Math.min(bounds.max.x - halfW, this.position.x),
			);
		}

		if (extentY <= halfH * 2) {
			this.position.y = (bounds.min.y + bounds.max.y) / 2;
		} else {
			this.position.y = Math.max(
				bounds.min.y + halfH,
				Math.min(bounds.max.y - halfH, this.position.y),
			);
		}
	}
}
