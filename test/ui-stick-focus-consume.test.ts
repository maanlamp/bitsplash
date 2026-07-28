import { expect, test } from "bun:test";
import { createElement } from "react";
import { token } from "../src/engine/input/edge-detector";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import type { ViewProps } from "../src/engine/ui/reconciler/ui-elements";
import {
	FocusRows,
	headlessUi,
	IdStore,
	mountSync,
	snapshot,
	stickSnapshot,
} from "./support/ui-fixture";

const STICK_Y = token.stick("0", "0", "y");

const row = (id: string, index: number): ViewProps => ({
	id,
	focusable: true,
	style: {
		position: "absolute",
		left: 0,
		top: index * 20,
		width: 60,
		height: 20,
	},
});

const focusRowsUi = (ids: readonly string[] = ["a", "b"]) => {
	const ui = headlessUi();
	const store = new IdStore(ids);
	mountSync(ui, createElement(FocusRows, { store, rowProps: row }));
	ui.layout(1, 200, 200);
	const frame = (input: DeviceSnapshot): DeviceSnapshot => {
		let masked: DeviceSnapshot = input;
		ui.step(input, 1, 1 / 60, (m) => {
			masked = m;
		});
		return masked;
	};
	return { ui, frame };
};

test("a stick-driven focus move consumes the stick axis it spent", () => {
	const { ui, frame } = focusRowsUi();

	frame(stickSnapshot(0, 0));
	const masked = frame(stickSnapshot(0, 1));

	expect(ui.dispatcher.focusNav.focused?.props.id).toBe("a");
	expect(ui.dispatcher.consumed.has(STICK_Y)).toBe(true);
	expect(masked.gamepads["0"]!.axes["0"]!.y).toBe(0);
});

test("a stick the UI cannot spend reaches gameplay untouched", () => {
	const { ui, frame } = focusRowsUi([]);

	frame(stickSnapshot(0, 0));
	const masked = frame(stickSnapshot(1, 1));

	expect(ui.dispatcher.consumed.size).toBe(0);
	expect(masked.gamepads["0"]!.axes["0"]!.x).toBe(1);
	expect(masked.gamepads["0"]!.axes["0"]!.y).toBe(1);
});

test("the keyboard focus path still consumes its key", () => {
	const { ui, frame } = focusRowsUi();

	frame(snapshot());
	const masked = frame(snapshot({ ARROWDOWN: true }));

	expect(ui.dispatcher.consumed.has("kbd:ARROWDOWN")).toBe(true);
	expect(masked.keyboard.keys.ARROWDOWN).toBeUndefined();
});
