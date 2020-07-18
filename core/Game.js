import Canvas from "./Canvas.js";
import Keys from "./Keys.js";
import Player from "../entities/Player.js";

export default class Game {

	#entities = [new Player()];
	#viewport = new Canvas();
	#keys = new Keys();
	#state = { keys: this.#keys }; // TODO: Extract into class

	constructor () {
		document.body.append(this.#viewport.element);
		this.#viewport.element.id = "viewport";
		this.start();
	}

	update () {
		for (const entity of this.#entities) {
			// TODO: Verify updatable trait
			entity.update(this.#state);
		}
	}

	render () {
		this.#viewport.clear();
		for (const entity of this.#entities) {
			// TODO: Verify renderable trait
			entity.render(this.#viewport);
		}
		this.#viewport.text(this.#state.delta.toString());
	}

	start () {
		let currentTime = 0;
		const loop = (lastTime) => {
			const delta = lastTime - currentTime || 0;
			currentTime = lastTime;
			this.#state.delta = delta;

			this.update();
			this.render();
			requestAnimationFrame(loop);
		}
		loop();
	}

}