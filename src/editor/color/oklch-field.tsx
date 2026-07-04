import {
	type ReactNode,
	useState,
	useSyncExternalStore,
} from "react";
import type { ColorPickerModel } from "./color-model";
import { CHROMA_MAX } from "./color-square";
import styles from "./color-picker.module.scss";

const format = (value: number, digits: number): string =>
	Number(value.toFixed(digits)).toString();

type SegmentProps = Readonly<{
	value: number;
	digits: number;
	step: number;
	bigStep: number;
	min: number;
	max: number;
	wrap?: boolean;
	label: string;
	onChange: (value: number, commit: boolean) => void;
}>;

const Segment = ({
	value,
	digits,
	step,
	bigStep,
	min,
	max,
	wrap,
	label,
	onChange,
}: SegmentProps) => {
	const [focused, setFocused] = useState(false);
	const [text, setText] = useState("");

	const clamp = (v: number): number =>
		wrap ? ((v % max) + max) % max : Math.min(max, Math.max(min, v));

	return (
		<input
			className={styles.oklchSegment}
			aria-label={label}
			inputMode="decimal"
			value={focused ? text : format(value, digits)}
			onFocus={(e) => {
				setFocused(true);
				setText(format(value, digits));
				e.currentTarget.select();
			}}
			onChange={(e) => {
				const raw = e.target.value;
				setText(raw);
				const n = Number(raw);
				if (raw.trim() !== "" && Number.isFinite(n)) {
					onChange(clamp(n), false);
				}
			}}
			onBlur={() => {
				setFocused(false);
				const n = Number(text);
				onChange(Number.isFinite(n) ? clamp(n) : value, true);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.currentTarget.blur();
					return;
				}
				if (e.key === "ArrowUp" || e.key === "ArrowDown") {
					e.preventDefault();
					const dir = e.key === "ArrowUp" ? 1 : -1;
					const delta = (e.shiftKey ? bigStep : step) * dir;
					const base = Number(text);
					const current =
						focused && Number.isFinite(base) ? base : value;
					const next = clamp(current + delta);
					setText(format(next, digits));
					onChange(next, false);
				}
			}}
		/>
	);
};

// A single visual field whose L / C / H / A segments are individual editable
// inputs, each writing its channel through the model.
// The OKLCH value as one bordered input group: an optional left slot (a
// colour swatch/eyedropper) followed by editable L / C / H / A segments.
const OklchField = ({
	model,
	leftSlot,
}: Readonly<{ model: ColorPickerModel; leftSlot?: ReactNode }>) => {
	useSyncExternalStore(
		(listener) => model.subscribe(listener),
		() => model.css,
	);
	const commit = () => model.commit?.();
	return (
		<div className={styles.oklchField}>
			{leftSlot}
			<span className={styles.oklchSyntax}>oklch(</span>
			<Segment
				value={model.l}
				digits={4}
				step={0.01}
				bigStep={0.1}
				min={0}
				max={1}
				label="Lightness"
				onChange={(v, done) => {
					model.setLc(v, model.c);
					if (done) {
						commit();
					}
				}}
			/>
			<span className={styles.oklchSyntax}> </span>
			<Segment
				value={model.c}
				digits={4}
				step={0.005}
				bigStep={0.05}
				min={0}
				max={CHROMA_MAX}
				label="Chroma"
				onChange={(v, done) => {
					model.setLc(model.l, v);
					if (done) {
						commit();
					}
				}}
			/>
			<span className={styles.oklchSyntax}> </span>
			<Segment
				value={model.h}
				digits={2}
				step={1}
				bigStep={10}
				min={0}
				max={360}
				wrap
				label="Hue"
				onChange={(v, done) => {
					model.setH(v);
					if (done) {
						commit();
					}
				}}
			/>
			<span className={styles.oklchSyntax}> / </span>
			<Segment
				value={model.alpha}
				digits={3}
				step={0.01}
				bigStep={0.1}
				min={0}
				max={1}
				label="Alpha"
				onChange={(v, done) => {
					model.setAlpha(v);
					if (done) {
						commit();
					}
				}}
			/>
			<span className={styles.oklchSyntax}>)</span>
		</div>
	);
};

export default OklchField;
