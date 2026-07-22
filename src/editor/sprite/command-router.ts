import type { Command, History } from "../history";
import type {
	SelectionSnapshot,
	SpriteDocument,
} from "./sprite-document";

/**
 * A single sprite-editor edit, expressed as its forward action and real
 * inverse. `redo` is both the initial apply and the redo — {@link runCommand}
 * invokes it once to perform the edit, so the applied and redone code paths are
 * identical by construction and can never drift. `undo` is the minimal inverse:
 * for structural edits it is metadata-only (re-set a scalar, restore an order,
 * re-insert a layer); only the pixel path carries an {@link ImageData}.
 *
 * @example
 * ```ts
 * runCommand(doc, history, {
 *   redo: () => doc.renameLayer(id, next),
 *   undo: () => doc.renameLayer(id, prev),
 * });
 * ```
 */
export type SpriteCommand = Command;

/**
 * The single choke-point every sprite-editor edit — structural and pixel —
 * funnels through. It exists so the whole editor has exactly one place that:
 *
 * 1. **Commits any pending floating edit first.** An uncommitted floating
 *    selection/transform is folded into its cel before an unrelated command
 *    runs (Phase 3 semantics). Inert today —
 *    {@link SpriteDocument.commitPendingFloatingEdit} is a no-op until the
 *    selection suite registers a bridge.
 * 2. **Executes the command** by calling its `redo` once. Callers therefore do
 *    not pre-apply the edit; `redo` is the sole apply path.
 * 3. **Snapshots the selection state** and pairs it with the command so undo
 *    restores the selection that was active when the edit ran. Inert today —
 *    {@link SpriteDocument.captureSelection} returns `null` until Phase 3.
 * 4. **Pushes** the wrapped command onto the undo stack.
 *
 * Phase 1 (cels/tags/timing) adds new structural edits by writing more
 * `{ redo, undo }` real-inverse commands and routing them here — nothing about
 * this function changes. Phase 3 makes the two inert hooks live by registering a
 * floating-commit callback and a selection bridge on the document; this is the
 * one function they hook.
 *
 * Note: the floating-commit and selection snapshot happen at command time. For
 * multi-event gestures (a brush stroke, an opacity drag) the forward change is
 * previewed live on the document and only *recorded* here on release, so the
 * hooks fire once per committed command rather than per pointer move. Phase 3
 * may additionally commit floating edits at gesture *start*; that is an added
 * call, not a change to this contract.
 */
export const runCommand = (
	doc: SpriteDocument,
	history: History,
	command: SpriteCommand,
): void => {
	doc.commitPendingFloatingEdit();
	const selection: SelectionSnapshot | null = doc.captureSelection();
	void command.redo();
	history.push({
		redo: command.redo,
		undo: async () => {
			await command.undo();
			doc.restoreSelection(selection);
		},
	});
};
