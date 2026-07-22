import { Popover } from "@base-ui/react/popover";
import clsx from "clsx";
import { useState, useSyncExternalStore } from "react";
import surface from "../styles/surface.module.scss";
import type { ColorPickerModel } from "./color-model";
import ColorPanel, { swatchBackground } from "./color-panel";
import styles from "./color-picker.module.scss";

// A colour swatch button that opens the picker panel. Used standalone (e.g.
// the sprite editor toolbar).
const ColorPickerPopup = ({
	model,
	triggerClassName,
}: Readonly<{
	model: ColorPickerModel;
	triggerClassName?: string;
}>) => {
	const [open, setOpen] = useState(false);
	useSyncExternalStore(
		(listener) => model.subscribe(listener),
		() => model.css,
	);

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger
				className={clsx(styles.colorButton, triggerClassName)}
				style={{ background: swatchBackground(model.css) }}
			/>
			<Popover.Portal>
				<Popover.Positioner sideOffset={8} align="start">
					<Popover.Popup
						className={clsx(surface.surface, styles.colorPanel)}
					>
						<ColorPanel model={model} />
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
};

export default ColorPickerPopup;
