import { NumberField } from "@base-ui/react/number-field";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { ArrowsHorizontalIcon } from "@phosphor-icons/react/dist/icons/ArrowsHorizontal";
import { ArrowsVerticalIcon } from "@phosphor-icons/react/dist/icons/ArrowsVertical";
import { CircleIcon } from "@phosphor-icons/react/dist/icons/Circle";
import { SquareIcon } from "@phosphor-icons/react/dist/icons/Square";
import { useSyncExternalStore } from "react";
import Tooltip from "../tooltip";
import controls from "../styles/controls.module.scss";
import type { BrushShape } from "./brush-dab";
import type { InkMode } from "./sprite-modifiers";
import type { SpriteEditorState } from "./sprite-editor-state";
import styles from "./tool-options.module.scss";

const NumericField = ({
	label,
	value,
	min,
	max,
	onChange,
}: Readonly<{
	label: string;
	value: number;
	min: number;
	max?: number;
	onChange: (n: number) => void;
}>) => (
	<label className={styles.field}>
		<span>{label}</span>
		<NumberField.Root
			value={value}
			min={min}
			max={max}
			onValueChange={(next) => {
				if (next !== null && Number.isFinite(next)) {
					onChange(next);
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
 * The active tool's options plus the always-on symmetry toggle, rendered in the
 * sprite editor's floating toolbar. Brush size/shape (shared by the freehand,
 * shape and scatter tools), the freehand modifiers (pixel-perfect, stabilizer,
 * pressure→size/opacity), shape fill, the fill tool's contiguity/tolerance, the
 * dither density, and the scatter parameters surface only for the tools they
 * apply to; the ink selector (normal/alpha-lock/shading) and symmetry are
 * global. All controls are base-ui primitives bound directly to
 * {@link SpriteEditorState}.
 */
const ToolOptions = ({
	state,
}: Readonly<{ state: SpriteEditorState }>) => {
	// Subscribe to the store's version counter (a stable snapshot); a fresh object
	// literal here would make `useSyncExternalStore` see a changed value on every
	// render and loop until React aborts ("Maximum update depth exceeded"). The
	// fields are read directly from `state` on each version-driven re-render.
	useSyncExternalStore(state.subscribe, () => state.version);
	const { modifiers } = state;
	const snapshot = {
		tool: state.tool,
		brushSize: state.brushSize,
		brushShape: state.brushShape,
		pixelPerfect: modifiers.pixelPerfect,
		stabilizer: modifiers.stabilizer,
		symmetry: modifiers.symmetry,
		ink: modifiers.ink,
		fillContiguous: state.fillContiguous,
		fillTolerance: state.fillTolerance,
		wandContiguous: state.wandContiguous,
		wandTolerance: state.wandTolerance,
		shapeFill: state.shapeFill,
		pressureSize: state.pressureSize,
		pressureOpacity: state.pressureOpacity,
		ditherDensity: state.ditherDensity,
		scatterRadius: state.scatterRadius,
		scatterDensity: state.scatterDensity,
		scatterSizeJitter: state.scatterSizeJitter,
	};

	const { tool } = snapshot;
	const isFreehand =
		tool === "brush" || tool === "eraser" || tool === "dither";
	const isShape =
		tool === "line" || tool === "rectangle" || tool === "ellipse";
	const isRectOrEllipse = tool === "rectangle" || tool === "ellipse";
	const hasBrushSize = isFreehand || isShape || tool === "scatter";

	return (
		<div className={styles.options}>
			{hasBrushSize && (
				<>
					<NumericField
						label="Size"
						value={snapshot.brushSize}
						min={1}
						onChange={(n) => state.setBrushSize(n)}
					/>
					<ToggleGroup
						value={[snapshot.brushShape]}
						onValueChange={(value) => {
							if (value.length > 0) {
								state.setBrushShape(value[0] as BrushShape);
							}
						}}
						className={controls.toggleGroup}
					>
						<Tooltip label="Round brush">
							<Toggle value="round" className={controls.iconButton}>
								<CircleIcon
									weight={
										snapshot.brushShape === "round"
											? "fill"
											: undefined
									}
								/>
							</Toggle>
						</Tooltip>
						<Tooltip label="Square brush">
							<Toggle value="square" className={controls.iconButton}>
								<SquareIcon
									weight={
										snapshot.brushShape === "square"
											? "fill"
											: undefined
									}
								/>
							</Toggle>
						</Tooltip>
					</ToggleGroup>
				</>
			)}
			{isFreehand && (
				<>
					<Tooltip label="Pixel-perfect stroke">
						<Toggle
							pressed={snapshot.pixelPerfect}
							onPressedChange={(p) => state.setPixelPerfect(p)}
							className={controls.textToggle}
						>
							Pixel-perfect
						</Toggle>
					</Tooltip>
					<NumericField
						label="Stabilizer"
						value={snapshot.stabilizer}
						min={0}
						max={100}
						onChange={(n) => state.setStabilizer(n)}
					/>
					<Tooltip label="Pen pressure controls brush size">
						<Toggle
							pressed={snapshot.pressureSize}
							onPressedChange={(p) => state.setPressureSize(p)}
							className={controls.textToggle}
						>
							Pressure size
						</Toggle>
					</Tooltip>
					<Tooltip label="Pen pressure controls stroke opacity">
						<Toggle
							pressed={snapshot.pressureOpacity}
							onPressedChange={(p) => state.setPressureOpacity(p)}
							className={controls.textToggle}
						>
							Pressure opacity
						</Toggle>
					</Tooltip>
				</>
			)}
			{tool === "dither" && (
				<NumericField
					label="Density %"
					value={snapshot.ditherDensity}
					min={0}
					max={100}
					onChange={(n) => state.setDitherDensity(n)}
				/>
			)}
			{tool === "scatter" && (
				<>
					<NumericField
						label="Radius"
						value={snapshot.scatterRadius}
						min={0}
						onChange={(n) => state.setScatterRadius(n)}
					/>
					<NumericField
						label="Count"
						value={snapshot.scatterDensity}
						min={1}
						onChange={(n) => state.setScatterDensity(n)}
					/>
					<NumericField
						label="Jitter %"
						value={Math.round(snapshot.scatterSizeJitter * 100)}
						min={0}
						max={100}
						onChange={(n) => state.setScatterSizeJitter(n / 100)}
					/>
				</>
			)}
			{isRectOrEllipse && (
				<Tooltip label="Fill shape">
					<Toggle
						pressed={snapshot.shapeFill}
						onPressedChange={(p) => state.setShapeFill(p)}
						className={controls.textToggle}
					>
						Filled
					</Toggle>
				</Tooltip>
			)}
			{tool === "fill" && (
				<>
					<Tooltip label="Contiguous fill (vs. all matching)">
						<Toggle
							pressed={snapshot.fillContiguous}
							onPressedChange={(p) => state.setFillContiguous(p)}
							className={controls.textToggle}
						>
							Contiguous
						</Toggle>
					</Tooltip>
					<NumericField
						label="Tolerance"
						value={snapshot.fillTolerance}
						min={0}
						max={255}
						onChange={(n) => state.setFillTolerance(n)}
					/>
				</>
			)}
			{tool === "wand" && (
				<>
					<Tooltip label="Contiguous select (vs. all matching)">
						<Toggle
							pressed={snapshot.wandContiguous}
							onPressedChange={(p) => state.setWandContiguous(p)}
							className={controls.textToggle}
						>
							Contiguous
						</Toggle>
					</Tooltip>
					<NumericField
						label="Tolerance"
						value={snapshot.wandTolerance}
						min={0}
						max={255}
						onChange={(n) => state.setWandTolerance(n)}
					/>
				</>
			)}
			<div className={controls.toolbarSeparator} />
			<ToggleGroup
				value={[snapshot.ink]}
				onValueChange={(value) => {
					if (value.length > 0) {
						state.setInk(value[0] as InkMode);
					}
				}}
				className={controls.toggleGroup}
			>
				<Tooltip label="Normal ink">
					<Toggle value="normal" className={controls.textToggle}>
						Normal
					</Toggle>
				</Tooltip>
				<Tooltip label="Alpha-lock (preserve transparency)">
					<Toggle value="alpha-lock" className={controls.textToggle}>
						Lock α
					</Toggle>
				</Tooltip>
				<Tooltip label="Shading (walk the palette ramp)">
					<Toggle value="shading" className={controls.textToggle}>
						Shade
					</Toggle>
				</Tooltip>
			</ToggleGroup>
			<div className={controls.toolbarSeparator} />
			<Tooltip label="Horizontal symmetry">
				<Toggle
					pressed={snapshot.symmetry === "horizontal"}
					onPressedChange={(p) =>
						state.setSymmetry(p ? "horizontal" : "off")
					}
					className={controls.iconButton}
				>
					<ArrowsHorizontalIcon
						weight={
							snapshot.symmetry === "horizontal" ? "fill" : undefined
						}
					/>
				</Toggle>
			</Tooltip>
			<Tooltip label="Vertical symmetry">
				<Toggle
					pressed={snapshot.symmetry === "vertical"}
					onPressedChange={(p) =>
						state.setSymmetry(p ? "vertical" : "off")
					}
					className={controls.iconButton}
				>
					<ArrowsVerticalIcon
						weight={
							snapshot.symmetry === "vertical" ? "fill" : undefined
						}
					/>
				</Toggle>
			</Tooltip>
		</div>
	);
};

export default ToolOptions;
