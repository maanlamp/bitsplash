import { NumberField } from "@base-ui/react/number-field";
import { Popover } from "@base-ui/react/popover";
import { CaretDownIcon } from "@phosphor-icons/react/dist/icons/CaretDown";
import { StackIcon } from "@phosphor-icons/react/dist/icons/Stack";
import clsx from "clsx";
import { useSyncExternalStore } from "react";
import Button from "../button";
import surface from "../styles/surface.module.scss";
import Tooltip from "../tooltip";
import { usePortalContainer } from "../window/portal-container";
import styles from "./onion-control.module.scss";
import type { OnionState } from "./onion-state";

const CountField = ({
	label,
	value,
	onCommit,
}: Readonly<{
	label: string;
	value: number;
	onCommit: (n: number) => void;
}>) => (
	<label className={styles.field}>
		<span className={styles.fieldLabel}>{label}</span>
		<NumberField.Root
			value={value}
			min={0}
			onValueCommitted={(next) => {
				if (next !== null && Number.isFinite(next)) {
					onCommit(next);
				}
			}}
		>
			<NumberField.Group className={styles.group}>
				<NumberField.Input
					className={styles.input}
					aria-label={label}
				/>
			</NumberField.Group>
		</NumberField.Root>
	</label>
);

/**
 * Timeline control for onion skinning: a toggle that switches ghost frames on
 * or off, and a popover to set how many previous/next frames are ghosted. The
 * opacity falloff and tint colours are conventional defaults held in
 * {@link OnionState}, not exposed here (kept minimal per the step-17 plan).
 */
const OnionControl = ({ onion }: Readonly<{ onion: OnionState }>) => {
	const settings = useSyncExternalStore(
		onion.subscribe,
		() => onion.settings,
	);
	const container = usePortalContainer();

	return (
		<div className={styles.control}>
			<Tooltip
				label={settings.enabled ? "Onion skin on" : "Onion skin off"}
			>
				<Button
					variant="icon"
					className={clsx(settings.enabled && styles.active)}
					onClick={() => onion.toggle()}
					aria-label="Toggle onion skin"
					aria-pressed={settings.enabled}
				>
					<StackIcon />
				</Button>
			</Tooltip>
			<Popover.Root>
				<Tooltip label="Onion frames">
					<Popover.Trigger className={styles.settingsTrigger}>
						<CaretDownIcon />
					</Popover.Trigger>
				</Tooltip>
				<Popover.Portal container={container}>
					<Popover.Positioner sideOffset={8}>
						<Popover.Popup
							className={clsx(surface.surface, styles.popup)}
						>
							<CountField
								label="Previous"
								value={settings.prevCount}
								onCommit={(n) => onion.setPrevCount(n)}
							/>
							<CountField
								label="Next"
								value={settings.nextCount}
								onCommit={(n) => onion.setNextCount(n)}
							/>
						</Popover.Popup>
					</Popover.Positioner>
				</Popover.Portal>
			</Popover.Root>
		</div>
	);
};

export default OnionControl;
