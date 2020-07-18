import Vector2 from "./Vector2.js";

export default class Canvas {

	#context;
	#width;
	#height;
	#element;

	get element () { return this.#element; }
	get width () { return this.#width; }
	get height () { return this.#height; }

	constructor () {
		this.#element = document.createElement("canvas");
		this.#context = this.#element.getContext("2d");
		this.#width = this.#element.width;
		this.#height = this.#element.height;
		this.resize(1000, 640);
		this.clear();
		this.#context.fillStyle = "#00FF00";
		this.#context.strokeStyle = "#00FF00";
		this.#context.lineWidth = 2;
		this.#context.linejoin = "round";
	}

	clear () {
		this.#context.clearRect(0, 0, this.#width, this.#height);
	}

	resize (width, height = width) {
		this.#element.width = this.#width = width;
		this.#element.height = this.#height = height;
	}

	text (text, x = 3, y = 12) {
		this.#context.fillText(text, x, y);
	}

	circle (x, y, radius) {
		this.#context.beginPath();
		this.#context.arc(x, y, radius, 0, Math.PI * 2);
		this.#context.fill();
	}

	arrow (x, y, len, dir) {
		this.#context.save();
		this.#context.translate(x, y);
		this.#context.rotate(dir - Math.PI / 4);
		this.#context.beginPath();
		this.#context.moveTo(0, 0);
		this.#context.lineTo(len, len);
		this.#context.translate(len, len);
		this.#context.scale(.5, .5);
		this.#context.rotate(Vector2.deg2rad(145));
		this.#context.lineTo(10, 10);
		this.#context.rotate(Vector2.deg2rad(-145));
		this.#context.lineTo(10, 10);
		this.#context.rotate(Vector2.deg2rad(-145));
		this.#context.lineTo(10, 10);
		this.#context.rotate(Vector2.deg2rad(180));
		this.#context.lineTo(1, 1);
		this.#context.stroke();
		this.#context.restore();
	}

}