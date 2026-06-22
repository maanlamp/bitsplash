import Angle from "../angle";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import Vector2 from "../vector2";

@serializable("Transform")
export class TransformComponent {
	@serialize() position: Vector2;
	@serialize() rotation: Angle;
	@serialize() scale: Vector2;

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
