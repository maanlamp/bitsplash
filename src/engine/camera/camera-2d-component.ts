import { Camera2D } from "../camera/camera-2d";
import {
	serializable,
	serialize,
} from "../serialization/serializable";

@serializable("Camera2D", { runtime: true })
export class Camera2DComponent {
	@serialize() camera: Camera2D;
	@serialize() active: boolean;
	@serialize() priority: number;

	constructor(
		camera: Camera2D = new Camera2D(),
		active: boolean = true,
		priority: number = 0,
	) {
		this.camera = camera;
		this.active = active;
		this.priority = priority;
	}
}
