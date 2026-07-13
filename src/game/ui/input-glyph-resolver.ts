import type { GamepadFamily } from "../../engine/input/detect-gamepad-type";
import type { DeviceSnapshot } from "../../engine/input/device-snapshot";
import { detectGamepadType } from "../../engine/input/detect-gamepad-type";
import {
	GAMEPAD_BUTTONS,
	parseToken,
} from "../../engine/input/edge-detector";
import type { Activation } from "../../engine/input/bindings/action-catalog";
import type {
	ExpandedBinding,
	Expansion,
} from "../../engine/input/bindings/ref-expansion";
import type { ActiveInputDevice } from "../../engine/input/last-used-device";
import type AssetManager from "../../engine/assets";
import type { ActivationMarker } from "./key-cap";
import {
	type BrandedFamily,
	isBrandedFamily,
	type ResolvedInputIcon,
	resolveInputIcon,
} from "./input-icon-atlas";

export type InputGlyphDescriptor = Readonly<{
	activation: ActivationMarker;
	kind: "text" | "icon";
	text?: string;
	icon?: Readonly<{ family: BrandedFamily; index: number }>;
}>;

const KEY_LABELS: Readonly<Record<string, string>> = {
	SPACE: "Space",
	ENTER: "Enter",
	ESCAPE: "Esc",
	SHIFT: "Shift",
	CONTROL: "Ctrl",
	CTRL: "Ctrl",
	ALT: "Alt",
	TAB: "Tab",
	BACKSPACE: "Bksp",
	ARROWUP: "↑",
	ARROWDOWN: "↓",
	ARROWLEFT: "←",
	ARROWRIGHT: "→",
};

const MOUSE_LABELS: Readonly<Record<string, string>> = {
	left: "LMB",
	right: "RMB",
	middle: "MB3",
	back: "MB4",
	forward: "MB5",
	wheelUp: "MW Up",
	wheelDown: "MW Down",
};

const keyLabel = (code: string): string => KEY_LABELS[code] ?? code;

const mouseLabel = (code: string): string =>
	MOUSE_LABELS[code] ?? code;

const activationMarker = (
	activation: Activation,
): ActivationMarker => {
	switch (activation) {
		case "hold":
		case "whileHeld":
			return "hold";
		case "toggle":
			return "toggle";
		case "doubleTap":
			return "doubleTap";
		default:
			return "press";
	}
};

const deviceOfKind = (
	kind: ActiveInputDevice["kind"],
): "mkb" | "pad" => (kind === "gamepad" ? "pad" : "mkb");

const firstOfDevice = (
	list: readonly ExpandedBinding[],
	device: "kbd" | "mouse" | "pad",
): ExpandedBinding | null => {
	for (const binding of list) {
		const parsed = parseToken(binding.source.tokens[0] ?? "");
		if (parsed && parsed.device === device) {
			return binding;
		}
	}
	return null;
};

const pickBinding = (
	list: readonly ExpandedBinding[],
	device: "mkb" | "pad",
): ExpandedBinding | null => {
	if (list.length === 0) {
		return null;
	}
	if (device === "pad") {
		return firstOfDevice(list, "pad") ?? list[0]!;
	}
	return (
		firstOfDevice(list, "kbd") ??
		firstOfDevice(list, "mouse") ??
		list[0]!
	);
};

export const familyForDevice = (
	device: ActiveInputDevice,
	snapshot: DeviceSnapshot,
): GamepadFamily => {
	if (device.kind !== "gamepad" || device.padSlot === null) {
		return "generic";
	}
	const pad = snapshot.gamepads[device.padSlot];
	return pad ? detectGamepadType(pad.id, pad.mapping) : "generic";
};

export const resolveInputGlyph = (
	expansion: Expansion,
	device: ActiveInputDevice,
	family: GamepadFamily,
	actionId: string,
): InputGlyphDescriptor | null => {
	const list = expansion.byAction.get(actionId);
	if (!list || list.length === 0) {
		return null;
	}
	const binding = pickBinding(list, deviceOfKind(device.kind));
	if (!binding) {
		return null;
	}
	const parsed = parseToken(binding.source.tokens[0] ?? "");
	if (!parsed) {
		return null;
	}
	const activation = activationMarker(binding.activation);
	if (parsed.device === "kbd") {
		return { activation, kind: "text", text: keyLabel(parsed.code) };
	}
	if (parsed.device === "mouse") {
		return {
			activation,
			kind: "text",
			text: mouseLabel(parsed.code),
		};
	}
	const index = GAMEPAD_BUTTONS.indexOf(parsed.code);
	if (isBrandedFamily(family) && index >= 0) {
		return { activation, kind: "icon", icon: { family, index } };
	}
	return {
		activation,
		kind: "text",
		text: index >= 0 ? `B${index + 1}` : parsed.code,
	};
};

export type ResolvedHint = Readonly<{
	glyph: string | null;
	icon: ResolvedInputIcon | null;
	activation: ActivationMarker | null;
}>;

const EMPTY_HINT: ResolvedHint = {
	glyph: null,
	icon: null,
	activation: null,
};

export const resolveHint = (
	assetManager: AssetManager,
	expansion: Expansion,
	device: ActiveInputDevice,
	snapshot: DeviceSnapshot,
	actionId: string,
): ResolvedHint => {
	const family = familyForDevice(device, snapshot);
	const descriptor = resolveInputGlyph(
		expansion,
		device,
		family,
		actionId,
	);
	if (!descriptor) {
		return EMPTY_HINT;
	}
	if (descriptor.kind === "icon" && descriptor.icon) {
		return {
			glyph: null,
			icon: resolveInputIcon(
				assetManager,
				descriptor.icon.family,
				descriptor.icon.index,
			),
			activation: descriptor.activation,
		};
	}
	return {
		glyph: descriptor.text ?? null,
		icon: null,
		activation: descriptor.activation,
	};
};
