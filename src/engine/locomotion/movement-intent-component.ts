import { serializable } from "../serialization/serializable";

@serializable("MovementIntent")
export class MovementIntentComponent {
	moveX: number = 0;
	jumpPressed: boolean = false;
	jumpHeld: boolean = false;
	jumpSpeed: number | null = null;
	wantDrop: boolean = false;

	clear(): void {
		this.moveX = 0;
		this.jumpPressed = false;
		this.jumpHeld = false;
		this.jumpSpeed = null;
		this.wantDrop = false;
	}
}
