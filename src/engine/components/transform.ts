import Angle from "../angle.ts";
import { serializable } from "../serialization/serializable";
import Vector2 from "../vector2";

@serializable("Transform")
export class TransformComponent {
	position: Vector2;
	rotation: Angle;
	scale: Vector2;

	constructor(
		x: number = 0,
		y: number = 0,
		rotation:Angle = Angle.zero(),
		scale: Vector2 = Vector2.one(),
	) {
		this.position = new Vector2(x, y);
		this.rotation = rotation;
		this.scale = scale;
	}
}
