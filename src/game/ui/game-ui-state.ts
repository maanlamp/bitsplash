import type { SaveMetadata } from "../../engine/save/save-driver";

export type GamePhase = "menu" | "playing";
export type MenuView = "root" | "load";

export type ToastState = Readonly<{ text: string; alpha: number }>;

export type GameUiSnapshot = Readonly<{
	phase: GamePhase;
	paused: boolean;
	view: MenuView;
	saves: ReadonlyArray<SaveMetadata>;
	busy: boolean;
	toast: ToastState | null;
}>;

const INITIAL: GameUiSnapshot = {
	phase: "menu",
	paused: false,
	view: "root",
	saves: [],
	busy: false,
	toast: null,
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
}
