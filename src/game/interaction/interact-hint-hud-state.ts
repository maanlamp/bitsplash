import type { EntityId } from "../../engine/ecs";
import type { NineSliceInsets } from "../../engine/render/nine-slice";
import type { TileSource } from "../../engine/render/renderer-2d";
import type { FontSettings } from "../../engine/text/font-settings";
import type { ActivationMarker } from "../ui/key-cap";
import type { ResolvedInputIcon } from "../ui/input-icon-atlas";

export type InteractHintSnapshot = Readonly<{
	entity: EntityId | null;
	glyph: string;
	font: FontSettings | null;
	frame: TileSource | null;
	insets: NineSliceInsets | undefined;
	icon: ResolvedInputIcon | null;
	activation: ActivationMarker;
}>;

const CLOSED: InteractHintSnapshot = {
	entity: null,
	glyph: "",
	font: null,
	frame: null,
	insets: undefined,
	icon: null,
	activation: "press",
};

export class InteractHintHudState {
	private snap: InteractHintSnapshot = CLOSED;
	private readonly listeners = new Set<() => void>();

	getSnapshot = (): InteractHintSnapshot => this.snap;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	set(next: InteractHintSnapshot): void {
		if (
			this.snap.entity === next.entity &&
			this.snap.glyph === next.glyph &&
			this.snap.font === next.font &&
			this.snap.frame === next.frame &&
			this.snap.insets === next.insets &&
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

	clear(): void {
		this.set(CLOSED);
	}
}
