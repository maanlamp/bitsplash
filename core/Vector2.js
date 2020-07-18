export default class Vector2 {

	static deg2rad (degrees) {
		return degrees * Math.PI / 180;
	}

	static rad2deg (radians) {
		return radians * 180 / Math.PI;
	}

	static lenDir (len = 0, dir = 0) {
		return new Vector2(len * Math.cos(dir), len * Math.sin(dir));
	}

	#x = 0;
	#y = 0;

	get x () { return this.#x; }
	get y () { return this.#y; }

	constructor (x = 0, y = x) {
		this.#x = x;
		this.#y = y;
	}

	get mag () { return Math.sqrt(this.#x ** 2, this.#y ** 2); }

	set (x = 0, y = x) {
		this.#x = x;
		this.#y = y;
		return this;
	}

	setVec (other) {
		return this.set(other.x, other.y);
	}

	add (x, y = x) {
		this.#x += x;
		this.#y += y;
		return this;
	}

	addVec (other) {
		return this.add(other.x, other.y);
	}

	sub (x, y = x) {
		this.#x -= x;
		this.#y -= y;
		return this;
	}

	subVec (other) {
		return this.sub(other.x, other.y);
	}

	mul (x, y = x) {
		this.#x *= x;
		this.#y *= y;
		return this;
	}

	mulVec (other) {
		return this.mul(other.x, other.y);
	}

	div (x, y = x) {
		this.#x /= x;
		this.#y /= y;
		return this;
	}

	divVec (other) {
		return this.div(other.x, other.y);
	}

}