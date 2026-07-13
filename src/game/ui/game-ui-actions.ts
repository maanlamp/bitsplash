export type GameUiActions = Readonly<{
	newGame: () => void;
	continueLatest: () => void;
	openLoad: () => void;
	closeLoad: () => void;
	loadSlot: (slot: string) => void;
	deleteSlot: (slot: string) => void;
	resume: () => void;
	saveGame: () => void;
	quit: () => void;
}>;
