import {
	serializable,
	serialize,
} from "./serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "./serialization/serializable-value";

@serializable("Vector2")
export default class Vector2 implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	static zero(): Vector2 {
		return new Vector2(0, 0);
	}

	static one(): Vector2 {
		return new Vector2(1, 1);
	}

	static right(): Vector2 {
		return new Vector2(1, 0);
	}

	static left(): Vector2 {
		return new Vector2(-1, 0);
	}

	static up(): Vector2 {
		return new Vector2(0, -1);
	}

	static down(): Vector2 {
		return new Vector2(0, 1);
	}

	static fromAngle(radians: number): Vector2 {
		return new Vector2(Math.cos(radians), Math.sin(radians));
	}

	static fromArray(arr: [number, number]): Vector2 {
		return new Vector2(arr[0], arr[1]);
	}

	static from(n: number) {
		return new Vector2(n, n);
	}

	@serialize() x: number;
	@serialize() y: number;

	constructor(x: number = 0, y: number = 0) {
		this.x = x;
		this.y = y;
	}

	clone(): Vector2 {
		return new Vector2(this.x, this.y);
	}

	set(x: number, y: number): this {
		this.x = x;
		this.y = y;
		return this;
	}

	copy(v: Vector2): this {
		this.x = v.x;
		this.y = v.y;
		return this;
	}

	equals(v: Vector2): boolean;
	equals(v: Vector2, epsilon: number): boolean;
	equals(x: number, y: number): boolean;
	equals(x: number, y: number, epsilon: number): boolean;
	equals(
		vOrX: Vector2 | number,
		epsilonOrY: number = 0,
		epsilon: number = 0,
	): boolean {
		if (vOrX instanceof Vector2) {
			const eps = epsilonOrY;
			if (eps === 0) {
				return this.x === vOrX.x && this.y === vOrX.y;
			}
			return (
				Math.abs(this.x - vOrX.x) <= eps &&
				Math.abs(this.y - vOrX.y) <= eps
			);
		} else {
			if (epsilon === 0) {
				return this.x === vOrX && this.y === epsilonOrY;
			}
			return (
				Math.abs(this.x - vOrX) <= epsilon &&
				Math.abs(this.y - epsilonOrY) <= epsilon
			);
		}
	}

	add(v: Vector2): this;
	add(scalar: number): this;
	add(v: Vector2 | number): this {
		if (v instanceof Vector2) {
			this.x += v.x;
			this.y += v.y;
		} else {
			this.x += v;
			this.y += v;
		}
		return this;
	}

	sub(v: Vector2): this;
	sub(scalar: number): this;
	sub(v: Vector2 | number): this {
		if (v instanceof Vector2) {
			this.x -= v.x;
			this.y -= v.y;
		} else {
			this.x -= v;
			this.y -= v;
		}
		return this;
	}

	mul(v: Vector2): this;
	mul(scalar: number): this;
	mul(v: Vector2 | number): this {
		if (v instanceof Vector2) {
			this.x *= v.x;
			this.y *= v.y;
		} else {
			this.x *= v;
			this.y *= v;
		}
		return this;
	}

	div(v: Vector2): this;
	div(scalar: number): this;
	div(v: Vector2 | number): this {
		if (v instanceof Vector2) {
			this.x /= v.x;
			this.y /= v.y;
		} else {
			this.x /= v;
			this.y /= v;
		}
		return this;
	}

	negate(): this {
		this.x = -this.x;
		this.y = -this.y;
		return this;
	}

	abs(): this {
		this.x = Math.abs(this.x);
		this.y = Math.abs(this.y);
		return this;
	}

	floor(): this {
		this.x = Math.floor(this.x);
		this.y = Math.floor(this.y);
		return this;
	}

	ceil(): this {
		this.x = Math.ceil(this.x);
		this.y = Math.ceil(this.y);
		return this;
	}

	round(): this {
		this.x = Math.round(this.x);
		this.y = Math.round(this.y);
		return this;
	}

	length(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}

	lengthSq(): number {
		return this.x * this.x + this.y * this.y;
	}

	normalize(): this {
		const len = this.length();
		if (len !== 0) {
			this.div(len);
		}
		return this;
	}

	dot(v: Vector2): number {
		return this.x * v.x + this.y * v.y;
	}

	cross(v: Vector2): number {
		return this.x * v.y - this.y * v.x;
	}

	distanceTo(v: Vector2): number;
	distanceTo(x: number, y: number): number;
	distanceTo(vOrX: Vector2 | number, y?: number): number {
		if (vOrX instanceof Vector2) {
			return this.clone().sub(vOrX).length();
		}
		return this.clone().sub(new Vector2(vOrX, y!)).length();
	}

	distanceToSq(v: Vector2): number;
	distanceToSq(x: number, y: number): number;
	distanceToSq(vOrX: Vector2 | number, y?: number): number {
		if (vOrX instanceof Vector2) {
			return this.clone().sub(vOrX).lengthSq();
		}
		return this.clone().sub(new Vector2(vOrX, y!)).lengthSq();
	}

	angle(): number {
		return Math.atan2(this.y, this.x);
	}

	angleTo(v: Vector2): number {
		return Math.atan2(this.cross(v), this.dot(v));
	}

	rotate(radians: number): this {
		const cos = Math.cos(radians);
		const sin = Math.sin(radians);
		const x = this.x * cos - this.y * sin;
		const y = this.x * sin + this.y * cos;
		this.x = x;
		this.y = y;
		return this;
	}

	perpendicular(): this {
		const x = -this.y;
		this.y = this.x;
		this.x = x;
		return this;
	}

	lerp(v: Vector2, t: number): this;
	lerp(x: number, y: number, t: number): this;
	lerp(vOrX: Vector2 | number, tOrY: number, t?: number): this {
		if (vOrX instanceof Vector2) {
			this.x += (vOrX.x - this.x) * tOrY;
			this.y += (vOrX.y - this.y) * tOrY;
		} else {
			this.x += (vOrX - this.x) * t!;
			this.y += (tOrY - this.y) * t!;
		}
		return this;
	}

	clamp(min: Vector2, max: Vector2): this;
	clamp(minX: number, minY: number, maxX: number, maxY: number): this;
	clamp(
		minOrMinX: Vector2 | number,
		maxOrMinY: Vector2 | number,
		maxX?: number,
		maxY?: number,
	): this {
		if (
			minOrMinX instanceof Vector2 &&
			maxOrMinY instanceof Vector2
		) {
			this.x = Math.max(minOrMinX.x, Math.min(maxOrMinY.x, this.x));
			this.y = Math.max(minOrMinX.y, Math.min(maxOrMinY.y, this.y));
		} else {
			this.x = Math.max(minOrMinX as number, Math.min(maxX!, this.x));
			this.y = Math.max(maxOrMinY as number, Math.min(maxY!, this.y));
		}
		return this;
	}
}
