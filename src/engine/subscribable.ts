export class Subscribable {
	private listeners = new Set<() => void>();
	private _version = 0;
	private snapshots = new Map<
		string,
		{ version: number; value: unknown }
	>();

	get version(): number {
		return this._version;
	}

	/**
	 * A value cached against the current {@link version}: rebuilt the first time
	 * it is asked for after a change, and returned by identity until the next
	 * one. Lets a consumer depend on the value itself rather than on a version
	 * counter it never reads.
	 */
	protected cached<T>(key: string, build: () => T): T {
		const cached = this.snapshots.get(key);
		if (cached && cached.version === this._version) {
			return cached.value as T;
		}
		const value = build();
		this.snapshots.set(key, { version: this._version, value });
		return value;
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
