import { AlertDialog } from "@base-ui/react/alert-dialog";
import clsx from "clsx";
import Button from "./button";
import styles from "./confirm-dialog.module.scss";
import surface from "./styles/surface.module.scss";
import { usePortalContainer } from "./window/portal-container";

/**
 * The editor's single dirty-guard dialog, one grammar everywhere (plan lines
 * 93-96): **"Keep editing" (primary — aborts the close) / "Discard" (secondary —
 * proceeds)**. There is no Save button by explicit decision; the dialog exists
 * only to prevent accidental loss.
 *
 * The dirty unit is the document. `docs` lists the unsaved documents the pending
 * close would discard — one entry when closing a single dirty view, several when
 * closing a window (or quitting) with multiple dirty documents. It renders into
 * the owning window's document via {@link usePortalContainer}, so the guard
 * always appears in the window where the close was invoked (plan line 161).
 *
 * @example
 * <KeepEditingDialog
 *   open={!!pending}
 *   docs={["hero.bsprite", "level-1"]}
 *   onKeepEditing={abort}
 *   onDiscard={proceed}
 * />
 */
const KeepEditingDialog = ({
	open,
	docs,
	onKeepEditing,
	onDiscard,
}: Readonly<{
	open: boolean;
	docs: ReadonlyArray<string>;
	onKeepEditing: () => void;
	onDiscard: () => void;
}>) => {
	const container = usePortalContainer();
	const multiple = docs.length > 1;
	return (
		<AlertDialog.Root
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					onKeepEditing();
				}
			}}
		>
			<AlertDialog.Portal container={container}>
				<AlertDialog.Backdrop className={surface.backdrop} />
				<AlertDialog.Popup
					className={clsx(surface.dialogPopup, styles.confirmPanel)}
				>
					<AlertDialog.Title className={styles.confirmTitle}>
						{multiple
							? "Discard unsaved changes?"
							: "Discard your changes?"}
					</AlertDialog.Title>
					<AlertDialog.Description className={styles.confirmMessage}>
						{multiple
							? `These documents have unsaved changes: ${docs.join(", ")}.`
							: `${docs[0] ?? "This document"} has unsaved changes.`}
					</AlertDialog.Description>
					<div className={styles.confirmActions}>
						<Button variant="tertiary" onClick={onDiscard}>
							Discard
						</Button>
						<Button variant="primary" onClick={onKeepEditing}>
							Keep editing
						</Button>
					</div>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	);
};

export default KeepEditingDialog;
