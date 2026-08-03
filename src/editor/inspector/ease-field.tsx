import {
	EASE_PRESET_IDS,
	EASE_PRESETS,
	type Ease,
	type EasePresetId,
} from "../../engine/animation/ease";
import type { SelectOption } from "../../engine/serialization/serializable-value";
import type { FieldBinding } from "../commands";
import { Adornment, Field } from "./field";
import { EnumSelect, NumberInput } from "./inputs";

const CUSTOM = "custom";

const STEP = 0.01;
const LARGE_STEP = 0.1;
const DISPLAY_DECIMALS = 4;

const round = (n: number): number => {
	const scale = 10 ** DISPLAY_DECIMALS;
	return Math.round(n * scale) / scale;
};

const matches = (ease: Ease, preset: Ease): boolean =>
	ease.x1 === preset.x1 &&
	ease.y1 === preset.y1 &&
	ease.x2 === preset.x2 &&
	ease.y2 === preset.y2;

/**
 * The preset this curve *is*, by control points rather than by its stored
 * label, so a hand-edited curve that happens to land back on a preset reads as
 * that preset.
 */
const presetOf = (ease: Ease): EasePresetId | typeof CUSTOM =>
	EASE_PRESET_IDS.find((id) => matches(ease, EASE_PRESETS[id])) ??
	CUSTOM;

/**
 * Inspector editor for an {@link Ease}: the preset picker plus the four cubic
 * bezier control floats.
 *
 * Picking a preset writes all four controls; editing a control leaves the
 * picker reading "Custom". The x controls are clamped to `[0, 1]` because a
 * curve outside that range is not a function of time and `Ease` rejects it; the
 * y controls are free, which is what overshooting curves need.
 */
export const EaseField = ({
	value,
	binding,
}: Readonly<{ value: Ease; binding: FieldBinding }>) => {
	const selected = presetOf(value);
	const options: SelectOption[] =
		selected === CUSTOM
			? [{ label: "Custom", value: CUSTOM }, ...EASE_PRESET_IDS]
			: [...EASE_PRESET_IDS];

	const applyPreset = (id: string): void => {
		if (id === CUSTOM) {
			return;
		}
		const preset = EASE_PRESETS[id as EasePresetId];
		binding.commit(["x1"], preset.x1);
		binding.commit(["y1"], preset.y1);
		binding.commit(["x2"], preset.x2);
		binding.commit(["y2"], preset.y2);
		binding.commit(["label"], preset.label);
	};

	const applyControl = (key: string, n: number): void => {
		binding.commit([key], n);
		binding.commit(["label"], "");
	};

	return (
		<Field.Root>
			<EnumSelect
				value={selected}
				options={options}
				onCommit={(v) => applyPreset(String(v))}
			/>
			<Field.Row>
				<NumberInput
					value={round(value.x1)}
					step={STEP}
					largeStep={LARGE_STEP}
					min={0}
					max={1}
					onCommit={(n) => applyControl("x1", n)}
				>
					<Adornment>X1</Adornment>
				</NumberInput>
				<NumberInput
					value={round(value.y1)}
					step={STEP}
					largeStep={LARGE_STEP}
					onCommit={(n) => applyControl("y1", n)}
				>
					<Adornment>Y1</Adornment>
				</NumberInput>
			</Field.Row>
			<Field.Row>
				<NumberInput
					value={round(value.x2)}
					step={STEP}
					largeStep={LARGE_STEP}
					min={0}
					max={1}
					onCommit={(n) => applyControl("x2", n)}
				>
					<Adornment>X2</Adornment>
				</NumberInput>
				<NumberInput
					value={round(value.y2)}
					step={STEP}
					largeStep={LARGE_STEP}
					onCommit={(n) => applyControl("y2", n)}
				>
					<Adornment>Y2</Adornment>
				</NumberInput>
			</Field.Row>
		</Field.Root>
	);
};
