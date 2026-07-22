import type { SelectionClip } from "./selection-lift";

/**
 * The sprite editor's internal cut/copy/paste clipboard: a single
 * module-scoped {@link SelectionClip}. It is deliberately not the system
 * clipboard — copying pixels here never touches the OS clipboard and pasting
 * only ever reads what a prior editor copy/cut placed — so paste is
 * deterministic and needs no async permission prompts. Cross-application paste
 * (from the OS clipboard) is out of scope for the selection core.
 */
let clip: SelectionClip | null = null;

/** Store a clip, replacing any previous one. */
export const setClipboard = (next: SelectionClip): void => {
	clip = next;
};

/** The current clip, or `null` when nothing has been copied/cut yet. */
export const getClipboard = (): SelectionClip | null => clip;

/** Whether the clipboard holds a clip ready to paste. */
export const hasClipboard = (): boolean => clip !== null;
