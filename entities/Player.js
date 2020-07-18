import Physics from "../core/Physics.js";
import Vector2 from "../core/Vector2.js";

export default class Player {

	#position = new Vector2(100, 100);
	#physics = new Physics(this.#position);

	update (state) {
		this.#physics.update(state.delta, state.keys);
	}

	render (viewport) {
		viewport.circle(this.#position.x, this.#position.y, 5);
		viewport.arrow(this.#position.x, this.#position.y, this.#physics.velocity * 250, this.#physics.direction);
		viewport.text(`${Vector2.rad2deg(this.#physics.direction) | 0}°`, this.#position.x + 8, this.#position.y + 3);
		viewport.text(`${Math.round(this.#physics.velocity * 100 * 10) / 10} km/h`, this.#position.x + 8, this.#position.y + 13);
	}

}