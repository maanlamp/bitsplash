export class CameraShakeComponent {
	trauma: number;
	decay: number;
	maxOffset: number;
	frequency: number;

	constructor(
		decay: number = 1.5,
		maxOffset: number = 6,
		frequency: number = 30,
	) {
		this.trauma = 0;
		this.decay = decay;
		this.maxOffset = maxOffset;
		this.frequency = frequency;
	}
}
