import Angle from "../angle";
import { serializable } from "../serialization/serializable";
import Vector2 from "../vector2";

@serializable("Transform")
export class TransformComponent {
	position: Vector2;
	rotation: Angle;
	scale: Vector2;

	constructor(
		position = Vector2.zero(),
		rotation = Angle.zero(),
		scale = Vector2.one(),
	) {
		this.position = position;
		this.rotation = rotation;
		this.scale = scale;
	}
}
