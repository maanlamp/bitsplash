import { Dialog } from "@base-ui/react/dialog";
import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import Button from "../button";
import surface from "../styles/surface.module.scss";
import styles from "./new-sprite-dialog.module.scss";
import { TILESET_SUFFIX } from "../assets";
import { SHEET_COLUMNS } from "../../engine/tilemap/autotile";
import type { NewSpriteConfig } from "./sprite-editor";

const buildFilename = (raw: string, isTileset: boolean): string => {
	let name = raw
		.trim()
		.replace(/\.png$/i, "")
		.replace(/\.tileset$/i, "");
	if (!name) {
		name = isTileset ? "tileset" : "sprite";
	}
	return isTileset ? `${name}${TILESET_SUFFIX}` : `${name}.png`;
};

const NewSpriteDialog = ({
	open,
	isTileset,
	onConfirm,
	onClose,
}: Readonly<{
	open: boolean;
	isTileset: boolean;
	onConfirm: (config: NewSpriteConfig) => void;
	onClose: () => void;
}>) => {
	const [name, setName] = useState("");
	const [kind, setKind] = useState(isTileset);
	const [width, setWidth] = useState(isTileset ? 96 : 32);
	const [height, setHeight] = useState(isTileset ? 96 : 32);
	const wasOpen = useRef(false);

	useEffect(() => {
		if (open && !wasOpen.current) {
			setKind(isTileset);
			setName("");
			setWidth(isTileset ? 96 : 32);
			setHeight(isTileset ? 96 : 32);
		}
		wasOpen.current = open;
	}, [open, isTileset]);

	const confirm = () => {
		const w = kind
			? Math.max(
					SHEET_COLUMNS,
					Math.round(width / SHEET_COLUMNS) * SHEET_COLUMNS,
				)
			: Math.max(1, Math.round(width));
		const h = Math.max(1, Math.round(height));
		onConfirm({
			filename: buildFilename(name, kind),
			width: w,
			height: h,
		});
	};

	return (
		<Dialog.Root
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					onClose();
				}
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className={surface.backdrop} />
				<Dialog.Popup
					className={classNames(
						surface.dialogPopup,
						styles.newSpritePanel,
					)}
				>
					<Dialog.Title className={styles.newSpriteTitle}>
						{kind ? "New tileset" : "New sprite"}
					</Dialog.Title>
					<label className={styles.newSpriteField}>
						Name
						<input
							autoFocus
							className={surface.pickerInput}
							value={name}
							placeholder={kind ? "tileset" : "sprite"}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									confirm();
								}
							}}
						/>
					</label>
					<div className={styles.newSpriteSize}>
						<label className={styles.newSpriteField}>
							Width
							<input
								type="number"
								min={1}
								className={surface.pickerInput}
								value={width}
								onChange={(e) => setWidth(Number(e.target.value))}
							/>
						</label>
						<label className={styles.newSpriteField}>
							Height
							<input
								type="number"
								min={1}
								className={surface.pickerInput}
								value={height}
								onChange={(e) => setHeight(Number(e.target.value))}
							/>
						</label>
					</div>
					<div className={styles.newSpriteActions}>
						<Button variant="tertiary" onClick={onClose}>
							Cancel
						</Button>
						<Button variant="primary" onClick={confirm}>
							Create
						</Button>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
};

export default NewSpriteDialog;
