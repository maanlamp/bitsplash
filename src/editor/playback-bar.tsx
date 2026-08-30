import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { GameControllerIcon } from "@phosphor-icons/react/dist/icons/GameController";
import { PauseIcon } from "@phosphor-icons/react/dist/icons/Pause";
import { PencilIcon } from "@phosphor-icons/react/dist/icons/Pencil";
import { PlayIcon } from "@phosphor-icons/react/dist/icons/Play";
import { SkipForwardIcon } from "@phosphor-icons/react/dist/icons/SkipForward";
import { StopIcon } from "@phosphor-icons/react/dist/icons/Stop";
import Button from "./button";
import FloatingToolbar from "./floating-toolbar";
import styles from "./playback-bar.module.scss";
import controls from "./styles/controls.module.scss";
import Tooltip from "./tooltip";

type PlaybackBarProps = Readonly<{
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
				<div className={styles.group}>
					<span className={styles.groupLabel}>Input</span>
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
				</div>

				<div className={styles.divider} />

				<div className={styles.group}>
					<span className={styles.groupLabel}>Playback</span>
					<div className={styles.section}>
						<Tooltip label={paused ? "Resume" : "Pause"} shortcut="P">
							<Button variant="icon" onClick={onPause}>
								{paused ? <PlayIcon /> : <PauseIcon />}
							</Button>
						</Tooltip>
						<Tooltip label="Step" shortcut=".">
							<Button
								variant="icon"
								onClick={onStep}
								disabled={!paused}
							>
								<SkipForwardIcon />
							</Button>
						</Tooltip>
						<Tooltip label="Stop" shortcut="R">
							<Button variant="icon" onClick={onStop}>
								<StopIcon />
							</Button>
						</Tooltip>
					</div>
				</div>
			</>
		) : (
			<Tooltip label="Play" shortcut="P">
				<Button variant="icon" onClick={onRun}>
					<PlayIcon />
				</Button>
			</Tooltip>
		)}
	</FloatingToolbar>
);

export default PlaybackBar;
