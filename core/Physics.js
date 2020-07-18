import Vector2 from "./Vector2.js";

export default class Physics {

	#position;
	#mass = 10;
	#speed = 0;
	#direction = 0;

	get velocity () { return Math.sqrt(this.#speed / (this.#mass / 2)); }
	get direction () { return this.#direction; }

	constructor (position = new Vector2()) {
		this.#position = position;
	}

	update (delta, keys) {
		this.#position.addVec(Vector2.lenDir(this.velocity * delta, this.direction));
		if (keys.left) {
			this.#direction -= .1;
		}
		if (keys.right) {
			this.#direction += .1;
		}
		this.#direction = this.#direction % (Math.PI * 2);

		if (keys.up) {
			this.#speed += .0001;
		}
		if (keys.down) {
			this.#speed -= .0001;
		}
	}

}