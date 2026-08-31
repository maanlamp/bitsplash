import { NumberField } from "@base-ui/react/number-field";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/icons/ArrowClockwise";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/icons/ArrowCounterClockwise";
import { FlipHorizontalIcon } from "@phosphor-icons/react/dist/icons/FlipHorizontal";
import { FlipVerticalIcon } from "@phosphor-icons/react/dist/icons/FlipVertical";
import { FrameCornersIcon } from "@phosphor-icons/react/dist/icons/FrameCorners";
import { StampIcon } from "@phosphor-icons/react/dist/icons/Stamp";
import { useState, useSyncExternalStore } from "react";
import type { History } from "../history";
import ViewToolbar, {
	ViewToolbarButton,
	ViewToolbarSeparator,
} from "../view-toolbar";
import Tooltip from "../tooltip";
import type { SelectionController } from "./selection-controller";
import type { SpriteDocument } from "./sprite-document";
import type { SpriteEditorState } from "./sprite-editor-state";
import styles from "./tool-options.module.scss";
import {
	flipHorizontal,
	flipVertical,
	rotateCcw,
	rotateCw,
} from "./transform-commands";

/**
 * The sprite editor's docked view-level toolbar: whole-image / selection
 * commands that act on the document rather than a tool. Flips and 90° rotations
 * transform the active selection (or float) when one exists and the whole image
 * otherwise, each undoable. The RotSprite control rotates the selection by an
 * arbitrary angle (pixel-art-friendly), and "Free transform" opens the
 * scale/rotate/skew gizmo on the selection. "Capture brush" lifts the current
 * selection's pixels into a reusable custom-brush stamp and switches to the
 * custom-brush tool. The selection-only commands are disabled when nothing is
 * selected.
 */
const SpriteViewToolbar = ({
	doc,
	history,
	selection,
	state,
}: Readonly<{
	doc: SpriteDocument;
	history: History;
	selection: SelectionController | null;
	state: SpriteEditorState;
}>) => {
	const hasSelection = useSyncExternalStore(
		(cb) => (selection ? selection.subscribe(cb) : () => {}),
		() => (selection ? selection.state.kind !== "none" : false),
	);
	const [angle, setAngle] = useState(45);

	const captureBrush = () => {
		const stamp = selection?.captureBrushStamp();
		if (stamp) {
			state.setCustomBrush(stamp);
			state.setTool("custom-brush");
		}
	};

	return (
		<ViewToolbar aria-label="Sprite view commands">
			<ViewToolbarButton
				label="Flip horizontal"
				shortcut="Shift+H"
				onClick={() => flipHorizontal(doc.core, history, selection)}
			>
				<FlipHorizontalIcon />
			</ViewToolbarButton>
			<ViewToolbarButton
				label="Flip vertical"
				shortcut="Shift+V"
				onClick={() => flipVertical(doc.core, history, selection)}
			>
				<FlipVerticalIcon />
			</ViewToolbarButton>
			<ViewToolbarSeparator />
			<ViewToolbarButton
				label="Rotate 90° clockwise"
				onClick={() => rotateCw(doc.core, history, selection)}
			>
				<ArrowClockwiseIcon />
			</ViewToolbarButton>
			<ViewToolbarButton
				label="Rotate 90° counter-clockwise"
				onClick={() => rotateCcw(doc.core, history, selection)}
			>
				<ArrowCounterClockwiseIcon />
			</ViewToolbarButton>
			<ViewToolbarSeparator />
			<Tooltip label="Rotation angle (degrees, clockwise)">
				<label className={styles.field}>
					<NumberField.Root
						value={angle}
						step={1}
						onValueChange={(next) => {
							if (next !== null && Number.isFinite(next)) {
								setAngle(next);
							}
						}}
					>
						<NumberField.Group className={styles.group}>
							<NumberField.Input
								className={styles.input}
								aria-label="Rotation angle in degrees"
							/>
						</NumberField.Group>
					</NumberField.Root>
				</label>
			</Tooltip>
			<ViewToolbarButton
				label="Rotate selection by angle (RotSprite)"
				disabled={!hasSelection}
				onClick={() => selection?.rotateArbitrary(angle)}
			>
				<ArrowClockwiseIcon weight="duotone" />
			</ViewToolbarButton>
			<ViewToolbarSeparator />
			<ViewToolbarButton
				label="Free transform (scale / rotate / skew)"
				shortcut="Ctrl+T"
				disabled={!hasSelection}
				onClick={() => state.setTool("transform")}
			>
				<FrameCornersIcon />
			</ViewToolbarButton>
			<ViewToolbarButton
				label="Capture brush from selection"
				disabled={!hasSelection}
				onClick={captureBrush}
			>
				<StampIcon />
			</ViewToolbarButton>
		</ViewToolbar>
	);
};

export default SpriteViewToolbar;
