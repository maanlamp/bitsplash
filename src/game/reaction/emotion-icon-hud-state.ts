import type { EntityId } from "../../engine/ecs";
import type { ResolvedEmotionIcon } from "./resolve-emotion-icon";

/**
 * One actor currently showing an emotion overhead. `icon` is `null` while the
 * atlas is still loading — the node still mounts, so the anchor is already in
 * place when the art appears.
 */
export type EmotionIconEntry = Readonly<{
	entity: EntityId;
	icon: ResolvedEmotionIcon | null;
}>;

const sameEntry = (
	a: EmotionIconEntry,
	b: EmotionIconEntry,
): boolean =>
	a.entity === b.entity &&
	a.icon?.image === b.icon?.image &&
	a.icon?.srcX === b.icon?.srcX &&
	a.icon?.srcY === b.icon?.srcY;

const same = (
	a: readonly EmotionIconEntry[],
	b: readonly EmotionIconEntry[],
): boolean =>
	a.length === b.length &&
	a.every((entry, i) => sameEntry(entry, b[i]!));

/**
 * The set of overhead emotion icons React should render, published by
 * `EmotionIconHudSystem`. Compared by value rather than identity because the
 * system rebuilds the resolved crops every frame.
 */
export class EmotionIconHudState {
	private entries: readonly EmotionIconEntry[] = [];
	private readonly listeners = new Set<() => void>();

	getSnapshot = (): readonly EmotionIconEntry[] => this.entries;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	setEntries(entries: readonly EmotionIconEntry[]): void {
		if (same(this.entries, entries)) {
			return;
		}
		this.entries = entries;
		for (const listener of this.listeners) {
			listener();
		}
	}
}
