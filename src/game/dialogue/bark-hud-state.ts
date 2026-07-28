import type { EntityId } from "../../engine/ecs";
import type { LoadedFont } from "../../engine/load";
import type { FontSettings } from "../../engine/text/font-settings";
import type { RichLine } from "../../engine/text/rich-text";
import type { BubbleFrame } from "./bubble-frame";

/**
 * One bark bubble's whole content, as React props.
 *
 * Text lives here rather than in the dyn store because the dyn store's `text` is
 * only read when painting: the measure pass reads `props.children`, so a
 * dyn-driven string measures as nothing and leaves a zero-width frame with the
 * glyphs spilling out of it. A bark's text never changes for the life of its
 * component — it is written once when the `BarkComponent` is added and only its
 * `elapsed` ticks after that — so props cost nothing and reconciliation happens
 * on add and remove only.
 *
 * `text` is part of the view so a re-barked entity re-wraps: it is the identity
 * of the wrap, not decoration. `loadedFont` is the font `lines` were wrapped
 * with and the one the bubble measures its width from; produce the two together.
 */
export type BarkView = Readonly<{
	entity: EntityId;
	text: string;
	lines: readonly RichLine[];
	font: FontSettings;
	loadedFont: LoadedFont;
	frame: BubbleFrame;
	/**
	 * Layout scale for the bubble's fixed measurements — padding ring and tail —
	 * so they read at the same apparent size as the text, which is scaled through
	 * `font`. Quantized to the font's rounded size, so a gliding camera zoom
	 * changes it in steps rather than every frame.
	 */
	scale: number;
}>;

const same = (
	a: readonly BarkView[],
	b: readonly BarkView[],
): boolean => {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
};

/**
 * The bark bubbles currently on screen, one entry per barking entity.
 *
 * Views are compared by identity, so a producer that caches a view per
 * (entity, text) notifies React only when a bark starts or ends.
 *
 * @example
 * store.setViews([{ entity, text, lines, font, loadedFont, frame }]);
 */
export class BarkHudState {
	private views: readonly BarkView[] = [];
	private readonly listeners = new Set<() => void>();

	getSnapshot = (): readonly BarkView[] => this.views;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	setViews(views: readonly BarkView[]): void {
		if (same(this.views, views)) {
			return;
		}
		this.views = views;
		for (const listener of this.listeners) {
			listener();
		}
	}
}
