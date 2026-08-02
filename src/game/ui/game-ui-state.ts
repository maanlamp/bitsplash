import type { Binding } from "../../engine/input/bindings/action-catalog";
import type { SaveMetadata } from "../../engine/save/save-driver";

export type GamePhase = "menu" | "playing";

/**
 * Which menu screen is showing. `first-launch` is the accessibility pass and is
 * only ever entered from the main menu, before anything has been played.
 */
export type MenuView = "root" | "load" | "settings" | "first-launch";

export type ToastState = Readonly<{ text: string; alpha: number }>;

export type GameUiSnapshot = Readonly<{
	phase: GamePhase;
	paused: boolean;
	view: MenuView;
	saves: ReadonlyArray<SaveMetadata>;
	busy: boolean;
	toast: ToastState | null;
	/** What the Controls tab lists. Read-only there; the shell supplies it. */
	bindings: ReadonlyArray<Binding>;
}>;

const INITIAL: GameUiSnapshot = {
	phase: "menu",
	paused: false,
	view: "root",
	saves: [],
	busy: false,
	toast: null,
	bindings: [],
};

export class GameUiState {
	private snap: GameUiSnapshot = INITIAL;
	private readonly listeners = new Set<() => void>();

	getSnapshot = (): GameUiSnapshot => this.snap;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	private patch(next: Partial<GameUiSnapshot>): void {
		this.snap = { ...this.snap, ...next };
		for (const listener of this.listeners) {
			listener();
		}
	}

	setPhase(phase: GamePhase): void {
		this.patch({ phase });
	}

	setPaused(paused: boolean): void {
		this.patch({ paused });
	}

	setView(view: MenuView): void {
		this.patch({ view });
	}

	setSaves(saves: ReadonlyArray<SaveMetadata>): void {
		this.patch({ saves });
	}

	setBusy(busy: boolean): void {
		this.patch({ busy });
	}

	setToast(toast: ToastState | null): void {
		this.patch({ toast });
	}

	setBindings(bindings: ReadonlyArray<Binding>): void {
		this.patch({ bindings });
	}
}
