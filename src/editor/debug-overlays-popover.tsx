import { Checkbox } from "@base-ui/react/checkbox";
import { Popover } from "@base-ui/react/popover";
import { CheckIcon, EyeIcon } from "@phosphor-icons/react";
import classNames from "classnames";
import { type CSSProperties } from "react";
import Button from "./button";
import {
	DEBUG_OVERLAYS,
	type DebugFlags,
	type DebugOverlay,
} from "./debug-flags";
import styles from "./debug-overlays-popover.module.scss";
import surface from "./styles/surface.module.scss";
import Tooltip from "./tooltip";
import { useEditorValue } from "./use-editor";

const DebugOverlayRow = ({
	flags,
	overlay,
}: Readonly<{ flags: DebugFlags; overlay: DebugOverlay }>) => {
	const checked = useEditorValue(flags, (f) => f.get(overlay.id));
	return (
		<Checkbox.Root
			checked={checked}
			onCheckedChange={(value) => flags.set(overlay.id, value)}
			className={styles.row}
		>
			<span
				className={styles.swatch}
				style={
					{
						"--swatch": `var(${overlay.colorToken})`,
					} as CSSProperties
				}
			/>
			<span className={styles.label}>{overlay.label}</span>
			<span className={styles.check}>
				<Checkbox.Indicator className={styles.checkIcon}>
					<CheckIcon weight="bold" />
				</Checkbox.Indicator>
			</span>
		</Checkbox.Root>
	);
};

const DebugOverlaysPopover = ({
	flags,
}: Readonly<{ flags: DebugFlags }>) => (
	<Popover.Root>
		<Tooltip label="Debug overlays">
			<Popover.Trigger
				render={
					<Button variant="icon">
						<EyeIcon />
					</Button>
				}
			/>
		</Tooltip>
		<Popover.Portal>
			<Popover.Positioner sideOffset={8}>
				<Popover.Popup
					className={classNames(surface.surface, styles.popup)}
				>
					{DEBUG_OVERLAYS.map((overlay) => (
						<DebugOverlayRow
							key={overlay.id}
							flags={flags}
							overlay={overlay}
						/>
					))}
				</Popover.Popup>
			</Popover.Positioner>
		</Popover.Portal>
	</Popover.Root>
);

export default DebugOverlaysPopover;
