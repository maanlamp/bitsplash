import { useRef, useState } from "react";
import { clamp01 } from "../../../engine/noise";
import type { UiClickEvent } from "../../../engine/ui/input/ui-event";
import {
	Text,
	View,
} from "../../../engine/ui/reconciler/ui-elements";
import type { UiNode } from "../../../engine/ui/reconciler/ui-node";
import type { Style } from "../../../engine/ui/style/style";

/**
 * The controls the settings view is built from.
 *
 * The game UI is a canvas reconciler — `view`/`text` nodes laid out by Yoga —
 * so there is no DOM and no component library to reach for. These match the
 * vocabulary `menu-widgets.tsx` established for the menus they sit in.
 *
 * Every one of them is a single focusable row: left/right adjusts, up/down
 * leaves. The hit targets inside a row — `−`, `+`, the track, the on/off
 * segments — are deliberately not focusable, so traversing a tab is one press
 * per setting rather than four.
 */

const ROW_LABEL: [number, number, number, number] = [
	0.85, 0.85, 0.9, 1,
];

const ROW_LABEL_FOCUSED: [number, number, number, number] = [
	1, 1, 1, 1,
];

const VALUE_TEXT: [number, number, number, number] = [
	0.72, 0.72, 0.8, 1,
];

const row: Style = {
	flexDirection: "row",
	alignItems: "center",
	gap: 8,
	padding: 6,
	minWidth: 300,
	backgroundColor: [0.16, 0.16, 0.2, 1],
};

const rowFocused: Style = {
	...row,
	backgroundColor: [0.42, 0.34, 0.11, 1],
};

const label: Style = { flexGrow: 1, flexShrink: 1 };

const nudge: Style = {
	width: 18,
	flexShrink: 0,
	alignSelf: "stretch",
	alignItems: "center",
	justifyContent: "center",
	backgroundColor: [0.24, 0.24, 0.3, 1],
};

const trackBox: Style = {
	width: 96,
	flexShrink: 0,
	alignSelf: "stretch",
	justifyContent: "center",
};

const track: Style = {
	height: 8,
	backgroundColor: [0.08, 0.08, 0.1, 1],
};

const fill: Style = {
	height: "100%",
	backgroundColor: [0.86, 0.72, 0.3, 1],
};

const valueStyle: Style = {
	width: 56,
	flexShrink: 0,
	textAlign: "right",
};

const segment: Style = {
	flexShrink: 0,
	paddingLeft: 6,
	paddingRight: 6,
	alignSelf: "stretch",
	alignItems: "center",
	justifyContent: "center",
	backgroundColor: [0.24, 0.24, 0.3, 1],
};

const segmentOn: Style = {
	...segment,
	backgroundColor: [0.86, 0.72, 0.3, 1],
};

const SEGMENT_ON_TEXT: [number, number, number, number] = [
	0.1, 0.09, 0.06, 1,
];

const percent = (value: number): string =>
	`${Math.round(value * 100)}%`;

type RowShellProps = Readonly<{
	label: string;
	value: string;
	fraction: number;
	focusGroup: string;
	onStep: (direction: -1 | 1) => void;
	/** Where along the track the player clicked, `0..1`. */
	onScrub: (fraction: number) => void;
}>;

const RowShell = ({
	label: text,
	value,
	fraction,
	focusGroup,
	onStep,
	onScrub,
}: RowShellProps) => {
	const [focused, setFocused] = useState(false);
	const trackNode = useRef<UiNode | null>(null);
	const width = `${Math.round(clamp01(fraction) * 100)}%` as const;
	const scrub = (event: UiClickEvent): void => {
		const rect = trackNode.current?.layoutRect;
		if (!rect || rect.w <= 0) {
			return;
		}
		onScrub(clamp01((event.position.x - rect.x) / rect.w));
	};
	return (
		<View
			focusable
			focusGroup={focusGroup}
			style={focused ? rowFocused : row}
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
			onFocusMove={(event) => {
				if (event.direction === "left") {
					onStep(-1);
					return true;
				}
				if (event.direction === "right") {
					onStep(1);
					return true;
				}
			}}
		>
			<Text
				style={{
					...label,
					color: focused ? ROW_LABEL_FOCUSED : ROW_LABEL,
				}}
			>
				{text}
			</Text>
			<View style={nudge} onClick={() => onStep(-1)}>
				<Text style={{ color: ROW_LABEL }}>-</Text>
			</View>
			<View style={trackBox} onClick={scrub}>
				<View ref={trackNode} style={track}>
					<View style={{ ...fill, width }} />
				</View>
			</View>
			<View style={nudge} onClick={() => onStep(1)}>
				<Text style={{ color: ROW_LABEL }}>+</Text>
			</View>
			<Text style={{ ...valueStyle, color: VALUE_TEXT }}>
				{value}
			</Text>
		</View>
	);
};

export type MenuSliderProps = Readonly<{
	label: string;
	/** Current position, `0..1`. */
	value: number;
	onChange: (value: number) => void;
	/** How far one press of left/right or one click of `−`/`+` moves it. */
	step?: number;
	focusGroup?: string;
}>;

/**
 * A continuous `0..1` setting — a volume, a shake scale, a density.
 *
 * @example
 * <MenuSlider
 *   label="Master"
 *   value={playerSettings.masterVolume}
 *   onChange={(v) => playerSettings.setMasterVolume(v)}
 * />
 */
export const MenuSlider = ({
	label: text,
	value,
	onChange,
	step = 0.05,
	focusGroup = "settings",
}: MenuSliderProps) => (
	<RowShell
		label={text}
		value={percent(value)}
		fraction={value}
		focusGroup={focusGroup}
		onStep={(direction) =>
			onChange(clamp01(value + direction * step))
		}
		onScrub={(fraction) => onChange(fraction)}
	/>
);

export type MenuStopsProps<T extends string> = Readonly<{
	label: string;
	value: T;
	stops: ReadonlyArray<T>;
	labelOf: (stop: T) => string;
	onChange: (value: T) => void;
	focusGroup?: string;
}>;

/**
 * A setting with a handful of named stops rather than a continuum — weather
 * quality's low/medium/high. Reads as the same control because it is the same
 * kind of choice: coarse, ordered, and nothing downstream cares about precision.
 */
export const MenuStops = <T extends string>({
	label: text,
	value,
	stops,
	labelOf,
	onChange,
	focusGroup = "settings",
}: MenuStopsProps<T>) => {
	const index = Math.max(0, stops.indexOf(value));
	const last = Math.max(1, stops.length - 1);
	const select = (at: number): void => {
		const next = stops[Math.min(stops.length - 1, Math.max(0, at))];
		if (next !== undefined && next !== value) {
			onChange(next);
		}
	};
	return (
		<RowShell
			label={text}
			value={labelOf(value)}
			fraction={index / last}
			focusGroup={focusGroup}
			onStep={(direction) => select(index + direction)}
			onScrub={(fraction) => select(Math.round(fraction * last))}
		/>
	);
};

export type MenuSwitchProps = Readonly<{
	label: string;
	value: boolean;
	onChange: (value: boolean) => void;
	focusGroup?: string;
}>;

/**
 * An on/off setting, as a two-segment control: the live state is the lit
 * segment, and either segment can be clicked directly. Left is off, right is
 * on, confirm flips it — the same left/right/confirm the sliders answer to, so
 * a boolean reads as one more row rather than a bare word.
 */
export const MenuSwitch = ({
	label: text,
	value,
	onChange,
	focusGroup = "settings",
}: MenuSwitchProps) => {
	const [focused, setFocused] = useState(false);
	const toggle = (): void => onChange(!value);
	return (
		<View
			focusable
			focusGroup={focusGroup}
			style={focused ? rowFocused : row}
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
			onConfirm={toggle}
			onFocusMove={(event) => {
				if (event.direction === "left" && value) {
					onChange(false);
					return true;
				}
				if (event.direction === "right" && !value) {
					onChange(true);
					return true;
				}
			}}
		>
			<Text
				style={{
					...label,
					color: focused ? ROW_LABEL_FOCUSED : ROW_LABEL,
				}}
			>
				{text}
			</Text>
			<View
				style={value ? segment : segmentOn}
				onClick={() => onChange(false)}
			>
				<Text style={{ color: value ? VALUE_TEXT : SEGMENT_ON_TEXT }}>
					Off
				</Text>
			</View>
			<View
				style={value ? segmentOn : segment}
				onClick={() => onChange(true)}
			>
				<Text style={{ color: value ? SEGMENT_ON_TEXT : VALUE_TEXT }}>
					On
				</Text>
			</View>
		</View>
	);
};
