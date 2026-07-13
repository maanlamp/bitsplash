import type { SettingsStore } from "./settings-store";

export class LocalStorageSettingsStore implements SettingsStore {
	constructor(private readonly namespace = "bitsplash.settings") {}

	private scoped(key: string): string {
		return `${this.namespace}:${key}`;
	}

	get(key: string): string | null {
		try {
			return localStorage.getItem(this.scoped(key));
		} catch {
			return null;
		}
	}

	set(key: string, value: string): void {
		try {
			localStorage.setItem(this.scoped(key), value);
		} catch {
			return;
		}
	}
}
