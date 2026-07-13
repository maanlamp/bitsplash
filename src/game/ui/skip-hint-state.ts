import type { NineSliceInsets } from "../../engine/render/nine-slice";
import type { TileSource } from "../../engine/render/renderer-2d";
import type { ActivationMarker } from "./key-cap";
import type { ResolvedInputIcon } from "./input-icon-atlas";
import { KBD_INSETS } from "./kbd-frame";

export type SkipHintSnapshot = Readonly<{
	open: boolean;
	frame: TileSource | null;
	insets: NineSliceInsets;
	glyph: string;
	icon: ResolvedInputIcon | null;
	activation: ActivationMarker;
}>;

const CLOSED: SkipHintSnapshot = {
	open: false,
	frame: null,
	insets: KBD_INSETS,
	glyph: "E",
	icon: null,
	activation: "hold",
};

export class SkipHintState {
	private snap: SkipHintSnapshot = CLOSED;
	private readonly listeners = new Set<() => void>();

	getSnapshot = (): SkipHintSnapshot => this.snap;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	set(next: SkipHintSnapshot): void {
		if (
			this.snap.open === next.open &&
			this.snap.frame === next.frame &&
			this.snap.insets === next.insets &&
			this.snap.glyph === next.glyph &&
			this.snap.icon === next.icon &&
			this.snap.activation === next.activation
		) {
			return;
		}
		this.snap = next;
		for (const listener of this.listeners) {
			listener();
		}
	}
}
