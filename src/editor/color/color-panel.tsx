import { EyedropperIcon } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import Button from "../button";
import Tooltip from "../tooltip";
import type { ColorPickerModel } from "./color-model";
import ColorSquare from "./color-square";
import styles from "./color-picker.module.scss";
import { eyeDropperSupported, pickScreenColor } from "./eyedropper";
import GradientSlider from "./gradient-slider";
import OklchField from "./oklch-field";
import SliderValue from "./slider-value";

const HUE_TRACK =
	"linear-gradient(to right in oklch longer hue, oklch(0.7 0.2 0), oklch(0.7 0.2 360))";

export const CHECKER = "var(--checker)";

// A flat colour drawn over the checkerboard, for swatches/triggers.
export const swatchBackground = (css: string): string =>
	`linear-gradient(${css}, ${css}), ${CHECKER}`;

// The picker body: gamut square, hue + alpha sliders, swatch, and the OKLCH
// value field. Shared by the standalone popup and the inspector field.
const ColorPanel = ({
	model,
}: Readonly<{ model: ColorPickerModel }>) => {
	useSyncExternalStore(
		(listener) => model.subscribe(listener),
		() => model.css,
	);
	const commit = () => model.commit?.();
	const eyedrop = async () => {
		const picked = await pickScreenColor();
		if (picked) {
			model.setColor(picked);
			commit();
		}
	};
	return (
		<>
			<ColorSquare
				l={model.l}
				c={model.c}
				h={model.h}
				onPick={(l, c) => model.setLc(l, c)}
				onCommit={commit}
			/>
			<div className={styles.colorSliders}>
				<div className={styles.colorSlidersStack}>
					<GradientSlider
						value={model.h / 360}
						onChange={(v) => model.setH(v * 360)}
						onCommit={commit}
						background={HUE_TRACK}
						display={
							<SliderValue value={Math.round(model.h)} suffix="°" />
						}
					/>
					<GradientSlider
						value={model.alpha}
						onChange={(v) => model.setAlpha(v)}
						onCommit={commit}
						background={`linear-gradient(to right, transparent, ${model.opaqueCss}), ${CHECKER}`}
						display={
							<SliderValue
								value={model.alpha}
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
						style={{ background: model.opaqueCss }}
					/>
					<div
						className={styles.swatchHalf}
						style={{ background: swatchBackground(model.css) }}
					/>
				</div>
			</div>
			<div className={styles.colorBottom}>
				{eyeDropperSupported() && (
					<Tooltip label="Pick colour from screen">
						<Button variant="icon" onClick={eyedrop}>
							<EyedropperIcon />
						</Button>
					</Tooltip>
				)}
				<OklchField model={model} />
			</div>
		</>
	);
};

export default ColorPanel;
