import type { SettingsStore } from "../settings-store";

export class MemorySettingsStore implements SettingsStore {
	private readonly map = new Map<string, string>();

	get(key: string): string | null {
		return this.map.get(key) ?? null;
	}

	set(key: string, value: string): void {
		this.map.set(key, value);
	}
}
