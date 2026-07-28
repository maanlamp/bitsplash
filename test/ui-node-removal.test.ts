import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import type { DeviceSnapshot } from "../src/engine/input/device-snapshot";
import { findById } from "../src/engine/ui/input/node-tree";
import type { ViewProps } from "../src/engine/ui/reconciler/ui-elements";
import type { UiRuntime } from "../src/engine/ui/ui-runtime";
import {
	commitSync,
	FocusRows,
	headlessUi,
	IdStore,
	mountSync,
	snapshot,
} from "./support/ui-fixture";

const ROW_HEIGHT = 20;

const row = (id: string, index: number): ViewProps => ({
	id,
	focusable: true,
	style: {
		position: "absolute",
		left: 0,
		top: index * ROW_HEIGHT,
		width: 60,
		height: ROW_HEIGHT,
	},
});

type Harness = Readonly<{
	ui: UiRuntime;
	store: IdStore;
	confirmed: string[];
	frame(input: DeviceSnapshot): DeviceSnapshot;
	nodeIdOf(id: string): number;
}>;

const harness = (
	ids: readonly string[],
	chained: boolean,
): Harness => {
	const ui = headlessUi();
	const store = new IdStore(ids);
	const confirmed: string[] = [];
	const rowProps = (id: string, index: number): ViewProps => {
		const props = row(id, index);
		const neighbors: ViewProps["focusNeighbors"] = {};
		if (index > 0) {
			neighbors.up = ids[index - 1]!;
		}
		if (index < ids.length - 1) {
			neighbors.down = ids[index + 1]!;
		}
		return {
			...props,
			focusNeighbors: chained ? neighbors : undefined,
			onConfirm: () => {
				confirmed.push(id);
			},
		};
	};

	mountSync(ui, createElement(FocusRows, { store, rowProps }));
	ui.layout(1, 200, 200);

	return {
		ui,
		store,
		confirmed,
		frame: (input) => {
			let masked: DeviceSnapshot = input;
			ui.step(input, 1, 1 / 60, (m) => {
				masked = m;
			});
			ui.layout(1, 200, 200);
			return masked;
		},
		nodeIdOf: (id) => findById(ui.root.tree, id)!.id,
	};
};

const focusRow = (h: Harness, id: string): void => {
	const node = findById(h.ui.root.tree, id)!;
	h.ui.dispatcher.focusNav.focus(node);
};

const focusedId = (h: Harness): string | null => {
	const focused = h.ui.dispatcher.focusNav.focused;
	return focused ? (focused.props.id as string) : null;
};

describe("focus survives an unmount", () => {
	test("focus re-resolves to the chain neighbour and confirm still fires and consumes", () => {
		const h = harness(["a", "b", "c"], true);
		focusRow(h, "b");

		commitSync(h.ui, () => {
			h.store.set(["a", "c"]);
		});

		expect(focusedId(h)).toBe("c");

		h.frame(snapshot());
		const masked = h.frame(snapshot({ ENTER: true }));

		expect(h.confirmed).toEqual(["c"]);
		expect(h.ui.dispatcher.consumed.has("kbd:ENTER")).toBe(true);
		expect(masked.keyboard.keys.ENTER).toBeUndefined();
	});

	test("without a focus chain it re-resolves geometrically", () => {
		const h = harness(["a", "b", "c"], false);
		focusRow(h, "b");

		commitSync(h.ui, () => {
			h.store.set(["a", "c"]);
		});

		expect(focusedId(h)).toBe("c");
	});

	test("removing the last remaining focusable clears focus", () => {
		const h = harness(["a"], true);
		focusRow(h, "a");

		commitSync(h.ui, () => {
			h.store.set([]);
		});

		expect(h.ui.dispatcher.focusNav.focused).toBeNull();
	});

	test("a removed node keeps no layout rect", () => {
		const h = harness(["a", "b"], true);
		const removed = findById(h.ui.root.tree, "b")!;
		expect(removed.layoutRect).toBeDefined();

		commitSync(h.ui, () => {
			h.store.set(["a"]);
		});

		expect(removed.layoutRect).toBeUndefined();
	});
});

test("dyn entries are evicted when their node unmounts", () => {
	const h = harness(["a", "b"], true);
	const nodeId = h.nodeIdOf("b");
	h.ui.dyn.set(nodeId, { alpha: 0.25 });
	expect(h.ui.dyn.get(nodeId)).toBeDefined();

	commitSync(h.ui, () => {
		h.store.set(["a"]);
	});

	expect(h.ui.dyn.get(nodeId)).toBeUndefined();
});
