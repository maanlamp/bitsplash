export class PlayerMovementStateComponent {
	grounded: boolean = false;
	jumping: boolean = false;
	jumpWasHeld: boolean = false;
	onWall: boolean = false;
	wallJumping: boolean = false;
	landing: boolean = false;
	canLand: boolean = true;
	jumpsRemaining: number;

	constructor(jumpsRemaining: number) {
		this.jumpsRemaining = jumpsRemaining;
	}
}
