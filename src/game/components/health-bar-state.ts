export class HealthBarStateComponent {
	displayed: number;
	lastHp: number;
	delay = 0;
	visible = 0;

	constructor(hp: number) {
		this.displayed = hp;
		this.lastHp = hp;
	}
}
