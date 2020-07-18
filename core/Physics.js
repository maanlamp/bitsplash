import Vector2 from "./Vector2.js";

export default class Physics {

	#position;
	#mass = 10;
	// DEBUG: non-zero for stress-testing
	#speed = .05;
	#direction = 0;

	get velocity () { return Math.sqrt(this.#speed / (this.#mass / 2)); }
	get direction () { return this.#direction; }

	constructor (position = new Vector2()) {
		this.#position = position;
	}

	update (state) {
		// DEBUG: circling for stress-testing
		this.#direction += .0275;

		if (state.keys.left) {
			this.#direction -= .1;
		}
		if (state.keys.right) {
			this.#direction += .1;
		}
		this.#direction = this.#direction % (Math.PI * 2);

		if (state.keys.up) {
			this.#speed += .1 * this.#speed;
		}
		if (state.keys.down) {
			this.#speed -= .1 * this.#speed;
		}

		// TODO: This doesn't seem to fully respect delta time... direction should be linked too, no?
		this.#position.addVec(Vector2.lenDir(this.velocity * state.delta, this.direction));
	}

}