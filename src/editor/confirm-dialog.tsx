import { AlertDialog } from "@base-ui/react/alert-dialog";
import classNames from "classnames";
import type { ReactNode } from "react";
import Button from "./button";
import styles from "./confirm-dialog.module.scss";
import surface from "./styles/surface.module.scss";

const ConfirmDialog = ({
	open,
	title,
	message,
	confirmLabel = "Yes",
	cancelLabel = "No",
	onConfirm,
	onCancel,
}: Readonly<{
	open: boolean;
	title: string;
	message: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm: () => void;
	onCancel: () => void;
}>) => (
	<AlertDialog.Root
		open={open}
		onOpenChange={(next) => {
			if (!next) {
				onCancel();
			}
		} }
	>
		<AlertDialog.Portal>
			<AlertDialog.Backdrop className={surface.backdrop} />
			<AlertDialog.Popup
				className={classNames(
					surface.dialogPopup,
					styles.confirmPanel
				)}
			>
				<AlertDialog.Title className={styles.confirmTitle}>
					{title}
				</AlertDialog.Title>
				<AlertDialog.Description className={styles.confirmMessage}>
					{message}
				</AlertDialog.Description>
				<div className={styles.confirmActions}>
					<Button variant="tertiary" onClick={onCancel}>
						{cancelLabel}
					</Button>
					<Button variant="primary" onClick={onConfirm}>
						{confirmLabel}
					</Button>
				</div>
			</AlertDialog.Popup>
		</AlertDialog.Portal>
	</AlertDialog.Root>
);

export default ConfirmDialog;
