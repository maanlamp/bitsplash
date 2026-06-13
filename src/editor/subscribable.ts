export class Subscribable {
	private listeners = new Set<() => void>();
	private _version = 0;

	get version(): number {
		return this._version;
	}

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	protected notify(): void {
		this._version += 1;
		for (const listener of this.listeners) {
			listener();
		}
	}
}
