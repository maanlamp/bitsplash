import { CornersOutIcon } from "@phosphor-icons/react/dist/icons/CornersOut";
import { SpinnerGapIcon } from "@phosphor-icons/react/dist/icons/SpinnerGap";
import Button from "./button";
import loading from "./loading.module.scss";
import type { PlaytestPhase } from "./playtest-state";
import styles from "./title-bar.module.scss";
import Tooltip, { TooltipProvider } from "./tooltip";

const PLAYTEST_LABEL: Record<PlaytestPhase, string> = {
	idle: "Playtest",
	launching: "Launching…",
	running: "Playtest running",
};

/**
 * The custom window titlebar worn by every editor window in the desktop app.
 * Most of its width is a window drag handle (`-webkit-app-region: drag`); the
 * native min/max/close controls sit in an Electron overlay on the right, outside
 * this region.
 *
 * The editor-global playtest action lives here as a `no-drag` island so it stays
 * clickable: it launches the separate game process and reflects the shared
 * {@link PlaytestPhase} broadcast by main, identically on every window. The
 * island is absolutely centered on the full window width, independent of the
 * logo, and sits clear of the native controls overlay on the right.
 */
const TitleBar = ({
	onPlaytest,
	playtestPhase,
}: Readonly<{
	onPlaytest: () => void;
	playtestPhase: PlaytestPhase;
}>) => (
	<div className={styles.titleBar}>
		<div className={styles.dragArea}>
			<span className={styles.appName}>Bitsplash</span>
		</div>
		<div className={styles.actions}>
			<TooltipProvider>
				<Tooltip label={PLAYTEST_LABEL[playtestPhase]} side="bottom">
					<Button
						variant="icon"
						onClick={onPlaytest}
						disabled={playtestPhase !== "idle"}
					>
						{playtestPhase === "launching" ? (
							<SpinnerGapIcon className={loading.spinner} />
						) : (
							<CornersOutIcon
								weight={
									playtestPhase === "running" ? "fill" : undefined
								}
							/>
						)}
					</Button>
				</Tooltip>
			</TooltipProvider>
		</div>
	</div>
);

export default TitleBar;
