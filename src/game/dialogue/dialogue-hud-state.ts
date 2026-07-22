import type { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import type { NineSliceInsets } from "../../engine/render/nine-slice";
import type { TileSource } from "../../engine/render/renderer-2d";
import type { FontSettings } from "../../engine/text/font-settings";
import type { RichLine } from "../../engine/text/rich-text";
import type { ActivationMarker } from "../ui/key-cap";
import type { ResolvedInputIcon } from "../ui/input-icon-atlas";

export type DialogueSnapshot = Readonly<{
	open: boolean;
	speaker: string;
	glyphs: readonly RichLine[];
	choices: readonly string[];
	selectedOption: number;
	more: boolean;
	advanceGlyph: string;
	advanceIcon: ResolvedInputIcon | null;
	advanceActivation: ActivationMarker;
	panel: TileSource | null;
	insets: NineSliceInsets;
	kbdFrame: TileSource | null;
	kbdInsets: NineSliceInsets | undefined;
	bodyFont: FontSettings | null;
	uiFont: FontSettings | null;
}>;

const FALLBACK_INSETS: NineSliceInsets = {
	left: 6,
	right: 6,
	top: 6,
	bottom: 7,
	gap: 2,
};

const CLOSED: DialogueSnapshot = {
	open: false,
	speaker: "",
	glyphs: [],
	choices: [],
	selectedOption: 0,
	more: false,
	advanceGlyph: "E",
	advanceIcon: null,
	advanceActivation: "press",
	panel: null,
	insets: FALLBACK_INSETS,
	kbdFrame: null,
	kbdInsets: undefined,
	bodyFont: null,
	uiFont: null,
};

const sameChoices = (
	a: readonly string[],
	b: readonly string[],
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

const same = (a: DialogueSnapshot, b: DialogueSnapshot): boolean =>
	a.open === b.open &&
	a.speaker === b.speaker &&
	a.glyphs === b.glyphs &&
	a.selectedOption === b.selectedOption &&
	a.more === b.more &&
	a.advanceGlyph === b.advanceGlyph &&
	a.advanceIcon === b.advanceIcon &&
	a.advanceActivation === b.advanceActivation &&
	a.panel === b.panel &&
	a.insets === b.insets &&
	a.kbdFrame === b.kbdFrame &&
	a.kbdInsets === b.kbdInsets &&
	a.bodyFont === b.bodyFont &&
	a.uiFont === b.uiFont &&
	sameChoices(a.choices, b.choices);

export class DialogueHudState {
	private snap: DialogueSnapshot = CLOSED;
	private live: DialogueComponent | null = null;
	private readonly listeners = new Set<() => void>();

	getSnapshot = (): DialogueSnapshot => this.snap;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	setComponent(component: DialogueComponent | null): void {
		this.live = component;
	}

	close(): void {
		this.live = null;
		this.setSnapshot(CLOSED);
	}

	setSnapshot(next: DialogueSnapshot): void {
		if (same(this.snap, next)) {
			return;
		}
		this.snap = next;
		for (const listener of this.listeners) {
			listener();
		}
	}

	select(index: number): void {
		if (this.live) {
			this.live.selectedOption = index;
		}
	}

	confirm(index: number): void {
		if (this.live) {
			this.live.selectedOption = index;
			this.live.pendingConfirm = true;
		}
	}
}
