import { Camera2D } from "../camera-2d";

export class Camera2DComponent {
	camera: Camera2D;
	active: boolean;
	priority: number;

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
