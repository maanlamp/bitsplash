import { useState } from "react";
import { Text, View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";

export const OVERLAY: Style = {
	position: "absolute",
	top: 0,
	left: 0,
	right: 0,
	bottom: 0,
	justifyContent: "center",
	alignItems: "center",
	backgroundColor: [0, 0, 0, 0.6],
};

export const PANEL: Style = {
	flexDirection: "column",
	gap: 6,
	padding: 12,
	minWidth: 160,
	backgroundColor: [0.09, 0.09, 0.12, 1],
};

export const TITLE: Style = {
	color: [1, 1, 1, 1],
	padding: 4,
	alignSelf: "center",
};

export const HINT: Style = {
	color: [0.55, 0.55, 0.62, 1],
	padding: 4,
	alignSelf: "center",
};

const button: Style = {
	padding: 8,
	minWidth: 140,
	alignItems: "center",
	backgroundColor: [0.18, 0.18, 0.22, 1],
};

const buttonFocused: Style = {
	...button,
	backgroundColor: [0.42, 0.34, 0.11, 1],
};

const buttonDisabled: Style = {
	...button,
	backgroundColor: [0.12, 0.12, 0.14, 1],
};

const IDLE_TEXT: [number, number, number, number] = [
	0.85, 0.85, 0.9, 1,
];
const FOCUSED_TEXT: [number, number, number, number] = [1, 1, 1, 1];
const DISABLED_TEXT: [number, number, number, number] = [
	0.4, 0.4, 0.45, 1,
];

export type MenuButtonProps = Readonly<{
	label: string;
	onActivate: () => void;
	focusGroup?: string;
	disabled?: boolean;
}>;

export const MenuButton = ({
	label,
	onActivate,
	focusGroup = "menu",
	disabled = false,
}: MenuButtonProps) => {
	const [focused, setFocused] = useState(false);
	const activate = (): void => {
		if (!disabled) {
			onActivate();
		}
	};
	const style = disabled
		? buttonDisabled
		: focused
			? buttonFocused
			: button;
	const textColor = disabled
		? DISABLED_TEXT
		: focused
			? FOCUSED_TEXT
			: IDLE_TEXT;
	return (
		<View
			focusable={!disabled}
			focusGroup={focusGroup}
			style={style}
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
			onClick={activate}
			onConfirm={activate}
		>
			<Text style={{ color: textColor }}>{label}</Text>
		</View>
	);
};
