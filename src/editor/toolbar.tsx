import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
	ArrowUUpLeftIcon,
	ArrowUUpRightIcon,
	PlayIcon,
} from "@phosphor-icons/react";
import Button from "./button";
import type { EditorMode } from "./editor-state";
import FloatingToolbar from "./floating-toolbar";
import { MODES } from "./modes";
import controls from "./styles/controls.module.scss";
import Tooltip from "./tooltip";

type ToolbarProps = Readonly<{
	mode: EditorMode;
	onModeChange: (mode: EditorMode) => void;
	onPlay: () => void;
	onUndo: () => void;
	onRedo: () => void;
	canUndo: boolean;
	canRedo: boolean;
	undoShortcut: string;
	redoShortcut: string;
}>;

const Toolbar = ({
	mode,
	onModeChange,
	onPlay,
	onUndo,
	onRedo,
	canUndo,
	canRedo,
	undoShortcut,
	redoShortcut,
}: ToolbarProps) => (
	<FloatingToolbar>
		<Tooltip label="Undo" shortcut={undoShortcut}>
			<Button variant="icon" onClick={onUndo} disabled={!canUndo}>
				<ArrowUUpLeftIcon />
			</Button>
		</Tooltip>
		<Tooltip label="Redo" shortcut={redoShortcut}>
			<Button variant="icon" onClick={onRedo} disabled={!canRedo}>
				<ArrowUUpRightIcon />
			</Button>
		</Tooltip>

		<div className={controls.toolbarSeparator} />

		<Tooltip label="Play" shortcut="P">
			<Button variant="icon" onClick={onPlay}>
				<PlayIcon />
			</Button>
		</Tooltip>

		<div className={controls.toolbarSeparator} />

		<ToggleGroup
			value={[mode]}
			onValueChange={(value) => {
				if (value.length > 0) {
					onModeChange(value[0]!);
				}
			}}
			className={controls.toggleGroup}
		>
			{MODES.map((m) => (
				<Tooltip
					key={m.id}
					label={m.label}
					shortcut={m.shortcut.toUpperCase()}
				>
					<Toggle value={m.id} className={controls.iconButton}>
						<m.icon weight={mode === m.id ? "fill" : undefined} />
					</Toggle>
				</Tooltip>
			))}
		</ToggleGroup>
	</FloatingToolbar>
);

export default Toolbar;
