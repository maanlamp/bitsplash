export class PlayerMovementStateComponent {
	grounded: boolean = false;
	jumping: boolean = false;
	jumpWasHeld: boolean = false;
	jumpsRemaining: number;

	constructor(jumpsRemaining: number) {
		this.jumpsRemaining = jumpsRemaining;
	}
}
