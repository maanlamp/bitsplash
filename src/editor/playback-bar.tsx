import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
	CornersOutIcon,
	GameControllerIcon,
	PauseIcon,
	PencilIcon,
	PlayIcon,
	SkipForwardIcon,
	SpinnerGapIcon,
	StopIcon,
} from "@phosphor-icons/react";
import Button from "./button";
import FloatingToolbar from "./floating-toolbar";
import loading from "./loading.module.scss";
import controls from "./styles/controls.module.scss";
import Tooltip from "./tooltip";

type PlaybackBarProps = Readonly<{
	onPlaytest: () => void;
	playtestLaunching: boolean;
	onRun: () => void;
	onStop: () => void;
	onPause: () => void;
	onStep: () => void;
	onSetMode: (mode: "game" | "editor") => void;
	inputMode: "game" | "editor";
	paused: boolean;
	running: boolean;
}>;

const PlaybackBar = ({
	onPlaytest,
	playtestLaunching,
	onRun,
	onStop,
	onPause,
	onStep,
	onSetMode,
	inputMode,
	paused,
	running,
}: PlaybackBarProps) => (
	<FloatingToolbar align="top">
		{running ? (
			<>
				<ToggleGroup
					value={[inputMode]}
					onValueChange={(value) => {
						const next = value[0];
						if (next === "game" || next === "editor") {
							onSetMode(next);
						}
					}}
					className={controls.toggleGroup}
				>
					<Tooltip label="Editor input" shortcut="Tab">
						<Toggle value="editor" className={controls.iconButton}>
							<PencilIcon
								weight={inputMode === "editor" ? "fill" : undefined}
							/>
						</Toggle>
					</Tooltip>
					<Tooltip label="Game input" shortcut="Tab">
						<Toggle value="game" className={controls.iconButton}>
							<GameControllerIcon
								weight={inputMode === "game" ? "fill" : undefined}
							/>
						</Toggle>
					</Tooltip>
				</ToggleGroup>

				<div className={controls.toolbarSeparator} />

				<Tooltip label={paused ? "Resume" : "Pause"} shortcut="P">
					<Button variant="icon" onClick={onPause}>
						{paused ? <PlayIcon /> : <PauseIcon />}
					</Button>
				</Tooltip>
				<Tooltip label="Step" shortcut=".">
					<Button variant="icon" onClick={onStep} disabled={!paused}>
						<SkipForwardIcon />
					</Button>
				</Tooltip>
				<Tooltip label="Stop" shortcut="R">
					<Button variant="icon" onClick={onStop}>
						<StopIcon />
					</Button>
				</Tooltip>
			</>
		) : (
			<>
				<Tooltip label="Play" shortcut="P">
					<Button variant="icon" onClick={onRun}>
						<PlayIcon />
					</Button>
				</Tooltip>
				<Tooltip
					label={playtestLaunching ? "Launching…" : "Playtest"}
					shortcut="⇧P"
				>
					<Button
						variant="icon"
						onClick={onPlaytest}
						disabled={playtestLaunching}
					>
						{playtestLaunching ? (
							<SpinnerGapIcon className={loading.spinner} />
						) : (
							<CornersOutIcon />
						)}
					</Button>
				</Tooltip>
			</>
		)}
	</FloatingToolbar>
);

export default PlaybackBar;
