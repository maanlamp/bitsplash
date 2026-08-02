import type { Binding } from "../../../engine/input/bindings/action-catalog";
import { GAMEPAD_BUTTONS } from "../../../engine/input/edge-detector";

const KEY_LABELS: Readonly<Record<string, string>> = {
	SPACE: "Space",
	ENTER: "Enter",
	ESCAPE: "Esc",
	SHIFT: "Shift",
	CONTROL: "Ctrl",
	ALT: "Alt",
	TAB: "Tab",
	ARROWUP: "Up",
	ARROWDOWN: "Down",
	ARROWLEFT: "Left",
	ARROWRIGHT: "Right",
};

const MOUSE_LABELS: Readonly<Record<string, string>> = {
	left: "Left click",
	right: "Right click",
	middle: "Middle click",
	back: "Mouse back",
	forward: "Mouse forward",
	wheelUp: "Wheel up",
	wheelDown: "Wheel down",
};

const tokenLabel = (token: string): string => {
	const separator = token.indexOf(":");
	if (separator === -1) {
		return token;
	}
	const device = token.slice(0, separator);
	const code = token.slice(separator + 1);
	if (device === "kbd") {
		return KEY_LABELS[code] ?? code;
	}
	if (device === "mouse") {
		return MOUSE_LABELS[code] ?? code;
	}
	const index = GAMEPAD_BUTTONS.indexOf(code);
	return index >= 0 ? `Pad ${code}` : code;
};

/**
 * What a binding reads as in the Controls list: `"Space"`, `"Left click"`,
 * `"Ctrl + S"`, or the action a `ref` binding borrows from.
 *
 * @example
 * bindingLabel({ action: "jump", source: { kind: "tokens", tokens: ["kbd:SPACE"] }, activation: "press" });
 * // "Space"
 */
export const bindingLabel = (binding: Binding): string => {
	const source = binding.source;
	if (source.kind === "ref") {
		return `Same as ${actionLabel(source.action)}`;
	}
	const labels = source.tokens.map(tokenLabel);
	return source.kind === "chord"
		? labels.join(" + ")
		: labels.join(", ");
};

/**
 * A readable name for an action id. Derived from the id rather than a hand-kept
 * table, so a new action never shows up in the list as a blank.
 *
 * @example
 * actionLabel("move.left"); // "Move left"
 */
export const actionLabel = (action: string): string => {
	const words = action.split(".").join(" ");
	return words.charAt(0).toUpperCase() + words.slice(1);
};
