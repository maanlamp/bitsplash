import { expect, test } from "bun:test";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import { UiEventDispatcher } from "../src/engine/ui/input/event-dispatcher";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";

let idCounter = 1;

type Rect = [number, number, number, number];

const view = (
	props: Record<string, unknown>,
	rect: Rect | null,
	children: UiNode[] = [],
): UiNode => {
	const node: UiNode = {
		type: "view",
		props,
		children,
		id: idCounter++,
	};
	if (rect) {
		node.layoutRect = {
			x: rect[0],
			y: rect[1],
			w: rect[2],
			h: rect[3],
		};
	}
	return node;
};

type FrameSpec = {
	keys?: string[];
	buttons?: string[];
	x?: number;
	y?: number;
	wheel?: [number, number];
};

const snapshot = (spec: FrameSpec): DeviceSnapshot => {
	const keys: Record<string, boolean> = {};
	for (const key of spec.keys ?? []) {
		keys[key] = true;
	}
	const buttons: Record<string, boolean> = {};
	for (const button of spec.buttons ?? []) {
		buttons[button] = true;
	}
	return {
		keyboard: { keys },
		mouse: {
			buttons,
			position: { x: spec.x ?? 0, y: spec.y ?? 0 },
			wheel: {
				x: spec.wheel ? spec.wheel[0] : 0,
				y: spec.wheel ? spec.wheel[1] : 0,
			},
		},
		gamepads: {},
	};
};

type StopControl = { stopPropagation(): void };

test("click runs capture then target then bubble in order", () => {
	const log: string[] = [];
	const button = view(
		{
			focusable: true,
			id: "btn",
			onClickCapture: () => log.push("btnCapture"),
			onClick: () => log.push("btnBubble"),
		},
		[0, 0, 50, 50],
	);
	const mid = view(
		{
			onClickCapture: () => log.push("midCapture"),
			onClick: () => log.push("midBubble"),
		},
		[0, 0, 100, 100],
		[button],
	);
	const root = view(
		{
			onClickCapture: () => log.push("rootCapture"),
			onClick: () => log.push("rootBubble"),
		},
		[0, 0, 200, 200],
		[mid],
	);

	const dispatcher = new UiEventDispatcher();
	dispatcher.dispatch(root, snapshot({ x: 5, y: 5 }), 1, 0.016);
	dispatcher.dispatch(
		root,
		snapshot({ x: 5, y: 5, buttons: ["left"] }),
		1,
		0.016,
	);
	dispatcher.dispatch(root, snapshot({ x: 5, y: 5 }), 1, 0.016);

	expect(log).toEqual([
		"rootCapture",
		"midCapture",
		"btnCapture",
		"btnBubble",
		"midBubble",
		"rootBubble",
	]);
});

test("stopPropagation halts the bubble walk", () => {
	const log: string[] = [];
	const button = view(
		{
			focusable: true,
			id: "btn",
			onClick: (e: StopControl) => {
				log.push("btnBubble");
				e.stopPropagation();
			},
		},
		[0, 0, 50, 50],
	);
	const root = view(
		{ onClick: () => log.push("rootBubble") },
		[0, 0, 200, 200],
		[button],
	);

	const dispatcher = new UiEventDispatcher();
	dispatcher.dispatch(root, snapshot({ x: 5, y: 5 }), 1, 0.016);
	dispatcher.dispatch(
		root,
		snapshot({ x: 5, y: 5, buttons: ["left"] }),
		1,
		0.016,
	);
	dispatcher.dispatch(root, snapshot({ x: 5, y: 5 }), 1, 0.016);

	expect(log).toEqual(["btnBubble"]);
});

test("click only fires when press and release land on the same node", () => {
	let clicks = 0;
	const button = view(
		{ focusable: true, id: "btn", onClick: () => clicks++ },
		[0, 0, 50, 50],
	);
	const root = view({}, [0, 0, 400, 400], [button]);

	const dispatcher = new UiEventDispatcher();
	dispatcher.dispatch(root, snapshot({ x: 5, y: 5 }), 1, 0.016);
	dispatcher.dispatch(
		root,
		snapshot({ x: 5, y: 5, buttons: ["left"] }),
		1,
		0.016,
	);
	dispatcher.dispatch(root, snapshot({ x: 300, y: 300 }), 1, 0.016);

	expect(clicks).toBe(0);
});

test("pointer over any element consumes the mouse tokens", () => {
	const button = view({ focusable: true, id: "btn" }, [0, 0, 50, 50]);
	const root = view({}, [0, 0, 200, 200], [button]);

	const dispatcher = new UiEventDispatcher();
	dispatcher.dispatch(root, snapshot({ x: 5, y: 5 }), 1, 0.016);
	expect(dispatcher.consumed.has("mouse:left")).toBe(true);

	dispatcher.dispatch(root, snapshot({ x: 500, y: 500 }), 1, 0.016);
	expect(dispatcher.consumed.has("mouse:left")).toBe(false);
});

test("pointer down over a focusable sets focus", () => {
	const button = view({ focusable: true, id: "btn" }, [0, 0, 50, 50]);
	const root = view({}, [0, 0, 200, 200], [button]);

	const dispatcher = new UiEventDispatcher();
	dispatcher.dispatch(root, snapshot({ x: 5, y: 5 }), 1, 0.016);
	dispatcher.dispatch(
		root,
		snapshot({ x: 5, y: 5, buttons: ["left"] }),
		1,
		0.016,
	);
	expect(dispatcher.focusNav.focused).toBe(button);
});

test("confirm dispatches to the focused node and consumes the key", () => {
	let confirmed = 0;
	const button = view(
		{ focusable: true, id: "btn", onConfirm: () => confirmed++ },
		[0, 0, 50, 50],
	);
	const root = view({}, [0, 0, 200, 200], [button]);

	const dispatcher = new UiEventDispatcher();
	dispatcher.focusNav.focus(button);
	dispatcher.dispatch(root, snapshot({ x: 500, y: 500 }), 1, 0.016);
	dispatcher.dispatch(
		root,
		snapshot({ x: 500, y: 500, keys: ["ENTER"] }),
		1,
		0.016,
	);

	expect(confirmed).toBe(1);
	expect(dispatcher.consumed.has("kbd:ENTER")).toBe(true);
});

test("focusmove navigates and consumes the arrow key", () => {
	const a = view({ focusable: true, id: "a" }, [0, 0, 10, 10]);
	const b = view({ focusable: true, id: "b" }, [20, 0, 10, 10]);
	const root = view({}, [0, 0, 200, 200], [a, b]);

	const dispatcher = new UiEventDispatcher();
	dispatcher.focusNav.focus(a);
	dispatcher.dispatch(
		root,
		snapshot({ x: 500, y: 500, keys: ["ARROWRIGHT"] }),
		1,
		0.016,
	);

	expect(dispatcher.focusNav.focused).toBe(b);
	expect(dispatcher.consumed.has("kbd:ARROWRIGHT")).toBe(true);
});
