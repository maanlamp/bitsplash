import { Popover } from "@base-ui/react/popover";
import { EyedropperIcon } from "@phosphor-icons/react";
import classNames from "classnames";
import { useState, useSyncExternalStore } from "react";
import Button from "../button";
import Tooltip from "../tooltip";
import surface from "../styles/surface.module.scss";
import styles from "./color-picker.module.scss";
import ColorSquare from "./color-square";
import GradientSlider from "./gradient-slider";
import { formatOklch, parseOklch } from "./oklch";
import SliderValue from "./slider-value";
import type { SpriteEditorState } from "./sprite-editor-state";

const HUE_TRACK =
	"linear-gradient(to right in oklch longer hue, oklch(0.7 0.2 0), oklch(0.7 0.2 360))";

const CHECKER = "var(--checker)";

const ColorPicker = ({
	state,
}: Readonly<{ state: SpriteEditorState }>) => {
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState("");
	useSyncExternalStore(
		state.subscribe,
		() => `${state.css}|${state.tool}`,
	);

	const commit = () => {
		const parsed = parseOklch(text);
		if (parsed) {
			state.setColor(parsed);
		}
		setEditing(false);
	};

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger
				className={styles.colorButton}
				style={{
					background: `linear-gradient(${state.css}, ${state.css}), ${CHECKER}`,
				}}
			/>
			<Popover.Portal>
				<Popover.Positioner sideOffset={8} align="start">
					<Popover.Popup
						className={classNames(surface.surface, styles.colorPanel)}
					>
						<ColorSquare
							l={state.l}
							c={state.c}
							h={state.h}
							onPick={(l, c) => state.setLc(l, c)}
						/>
						<div className={styles.colorSliders}>
							<div className={styles.colorSlidersStack}>
								<GradientSlider
									value={state.h / 360}
									onChange={(v) => state.setH(v * 360)}
									background={HUE_TRACK}
									display={
										<SliderValue
											value={Math.round(state.h)}
											suffix="°"
										/>
									}
								/>
								<GradientSlider
									value={state.alpha}
									onChange={(v) => state.setAlpha(v)}
									background={`linear-gradient(to right, transparent, ${state.opaqueCss}), ${CHECKER}`}
									display={
										<SliderValue
											value={state.alpha}
											format={{
												style: "percent",
												maximumFractionDigits: 0,
											}}
										/>
									}
								/>
							</div>
							<div className={styles.swatch}>
								<div
									className={styles.swatchHalf}
									style={{ background: state.opaqueCss }}
								/>
								<div
									className={styles.swatchHalf}
									style={{
										background: `linear-gradient(${state.css}, ${state.css}), ${CHECKER}`,
									}}
								/>
							</div>
						</div>
						<div className={styles.colorBottom}>
							<Tooltip label="Pick colour from canvas">
								<Button
									variant="icon"
									onClick={() => {
										state.setTool("pick");
										setOpen(false);
									}}
								>
									<EyedropperIcon
										weight={
											state.tool === "pick" ? "fill" : undefined
										}
									/>
								</Button>
							</Tooltip>
							<input
								className={styles.colorOklchInput}
								value={editing ? text : formatOklch(state.color)}
								onFocus={() => {
									setEditing(true);
									setText(formatOklch(state.color));
								}}
								onChange={(e) => setText(e.target.value)}
								onBlur={commit}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										commit();
									}
								}}
							/>
						</div>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
};

export default ColorPicker;
