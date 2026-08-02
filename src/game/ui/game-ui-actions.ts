export type GameUiActions = Readonly<{
	newGame: () => void;
	continueLatest: () => void;
	openLoad: () => void;
	closeLoad: () => void;
	loadSlot: (slot: string) => void;
	deleteSlot: (slot: string) => void;
	openSettings: () => void;
	closeSettings: () => void;
	/** The first-launch accessibility pass has been walked to its end. */
	finishFirstLaunch: () => void;
	resume: () => void;
	saveGame: () => void;
	quit: () => void;
}>;
