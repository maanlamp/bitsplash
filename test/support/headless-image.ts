/**
 * The minimum of `HTMLImageElement` the image loaders need, for the tests that
 * run without a DOM.
 *
 * Setting `src` resolves on the next microtask, which is what lets a loader's
 * promise settle. Listeners are supported rather than only `onload`, because
 * that is the API the loaders use; a double that accepts less than the real
 * thing fails as a `TypeError` from inside library code instead of as anything
 * a reader can act on.
 */
export class HeadlessImage {
	readonly #listeners = new Map<string, Set<() => void>>();
	#src = "";

	addEventListener(type: string, listener: () => void): void {
		let listeners = this.#listeners.get(type);
		if (!listeners) {
			listeners = new Set();
			this.#listeners.set(type, listeners);
		}
		listeners.add(listener);
	}

	removeEventListener(type: string, listener: () => void): void {
		this.#listeners.get(type)?.delete(listener);
	}

	set src(value: string) {
		this.#src = value;
		queueMicrotask(() => {
			for (const listener of this.#listeners.get("load") ?? []) {
				listener();
			}
		});
	}

	get src(): string {
		return this.#src;
	}
}

/**
 * Install {@link HeadlessImage} as the global `Image`, leaving a real one in
 * place if the environment already provides it.
 */
export const installHeadlessImage = (): void => {
	(globalThis as { Image?: unknown }).Image ??= HeadlessImage;
};
