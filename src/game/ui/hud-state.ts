export type HudSnapshot = Readonly<{
	notice: string | null;
	questLines: readonly string[];
}>;

const INITIAL: HudSnapshot = {
	notice: null,
	questLines: [],
};

const sameLines = (
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

export class HudState {
	private snap: HudSnapshot = INITIAL;
	private readonly listeners = new Set<() => void>();

	getSnapshot = (): HudSnapshot => this.snap;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	setNotice(notice: string | null): void {
		if (this.snap.notice === notice) {
			return;
		}
		this.snap = { ...this.snap, notice };
		this.emit();
	}

	setQuestLines(questLines: readonly string[]): void {
		if (sameLines(this.snap.questLines, questLines)) {
			return;
		}
		this.snap = { ...this.snap, questLines };
		this.emit();
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
