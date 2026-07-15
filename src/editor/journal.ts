import {
	applyEntry,
	invertEntry,
	type JournalEntry,
	type ReplayTarget,
} from "./journal-entry";

/**
 * The append-only edit log of a scene document.
 *
 * The JSDoc here is a deliberate, user-approved exception to the no-comments
 * rule (plan D1): the journal is the one place a future truncation, save-point,
 * or run-start rule must reason about, so its contract is documented.
 *
 * **Append-only.** The log never shrinks. A forward edit appends its entry;
 * {@link undo} appends the *inverse* of the last forward entry (it does not pop
 * it); {@link redo} re-appends the forward entry. Replaying the whole log onto a
 * baseline therefore reproduces the current authored state — e.g. `[A, B, B⁻¹]`
 * replays to A alone. `canUndo`/`canRedo` are driven by a separate cursor over
 * the *forward* entries; the log itself is immutable history.
 *
 * **Transactional.** {@link record} applies an entry to the live target first
 * and only appends if that succeeds; a throwing apply surfaces and appends
 * nothing. {@link recordApplied} is for edits whose live mutation already
 * happened (gesture previews) — it appends without re-applying.
 */
export class Journal {
	private readonly log: JournalEntry[] = [];
	private readonly undoable: JournalEntry[] = [];
	private readonly redoable: JournalEntry[] = [];
	private savePoint = 0;

	/**
	 * Log position a run began at. A hook for run-mode persistence; unused by
	 * idle editing but reserved so a later step can scope run edits.
	 */
	runStart = 0;

	get canUndo(): boolean {
		return this.undoable.length > 0;
	}

	get canRedo(): boolean {
		return this.redoable.length > 0;
	}

	/** Number of entries appended so far (including inverses). */
	get length(): number {
		return this.log.length;
	}

	/** Whether the log has advanced past the last recorded save point. */
	get dirty(): boolean {
		return this.log.length !== this.savePoint;
	}

	/** Apply an entry to `target`, then append it as a new forward edit. */
	record(entry: JournalEntry, target: ReplayTarget): void {
		applyEntry(entry, target);
		this.append(entry);
	}

	/**
	 * Append a forward edit whose live mutation the caller already performed
	 * (e.g. a color-picker drag that mutated the field for live preview).
	 */
	recordApplied(entry: JournalEntry): void {
		this.append(entry);
	}

	/**
	 * Undo the last forward edit by applying and appending its inverse. Returns
	 * the inverse that was applied (so a caller can mirror it onto a secondary
	 * best-effort target such as a run world), or `null` when nothing was undone.
	 */
	undo(target: ReplayTarget): JournalEntry | null {
		const forward = this.undoable.at(-1);
		if (!forward) {
			return null;
		}
		const inverse = invertEntry(forward);
		applyEntry(inverse, target);
		this.undoable.pop();
		this.redoable.push(forward);
		this.log.push(inverse);
		return inverse;
	}

	/**
	 * Redo the last undone edit by re-applying and re-appending it. Returns the
	 * forward entry that was applied, or `null` when nothing was redone.
	 */
	redo(target: ReplayTarget): JournalEntry | null {
		const forward = this.redoable.at(-1);
		if (!forward) {
			return null;
		}
		applyEntry(forward, target);
		this.redoable.pop();
		this.undoable.push(forward);
		this.log.push(forward);
		return forward;
	}

	/**
	 * Replay the entries recorded since the last {@link markSaved} onto
	 * `target`, in order. The baseline a save replays onto already incorporates
	 * everything up to the save point, so only the tail is replayed — replaying
	 * the whole log would double-apply the pre-save edits.
	 */
	replayPending(target: ReplayTarget): void {
		for (let i = this.savePoint; i < this.log.length; i++) {
			applyEntry(this.log[i]!, target);
		}
	}

	/** Mark the current log position as the last saved state. */
	markSaved(): void {
		this.savePoint = this.log.length;
	}

	/**
	 * Discard the entire log — the document-level revert. Distinct from
	 * {@link undo}: revert abandons the document's edits wholesale rather than
	 * inverting them one at a time.
	 */
	reset(): void {
		this.log.length = 0;
		this.undoable.length = 0;
		this.redoable.length = 0;
		this.savePoint = 0;
		this.runStart = 0;
	}

	private append(entry: JournalEntry): void {
		this.log.push(entry);
		this.undoable.push(entry);
		this.redoable.length = 0;
	}
}
