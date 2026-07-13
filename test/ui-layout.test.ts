import { beforeEach, describe, expect, test } from "bun:test";
import { YogaBridge } from "../src/engine/ui/layout/yoga-bridge";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import type { Style } from "../src/engine/ui/style/style";

let nextId = 1;

const node = (style: Style, children: UiNode[] = []): UiNode => ({
	type: "view",
	props: { style },
	children,
	id: nextId++,
});

const build = (bridge: YogaBridge, root: UiNode): void => {
	bridge.create(root);
	bridge.applyStyle(root, (root.props.style as Style) ?? {});
	for (const child of root.children) {
		build(bridge, child);
	}
};

describe("yoga bridge layout", () => {
	beforeEach(() => {
		nextId = 1;
	});

	test("row with equal flex grow splits width", () => {
		const a = node({ flexGrow: 1 });
		const b = node({ flexGrow: 1 });
		const root = node({ flexDirection: "row" }, [a, b]);
		const bridge = new YogaBridge();
		build(bridge, root);
		bridge.calculate(root, 200, 100);
		expect(a.layoutRect).toEqual({ x: 0, y: 0, w: 100, h: 100 });
		expect(b.layoutRect).toEqual({ x: 100, y: 0, w: 100, h: 100 });
	});

	test("row gap offsets siblings", () => {
		const a = node({ width: 40, height: 20 });
		const b = node({ width: 40, height: 20 });
		const root = node({ flexDirection: "row", gap: 10 }, [a, b]);
		const bridge = new YogaBridge();
		build(bridge, root);
		bridge.calculate(root, 200, 100);
		expect(a.layoutRect?.x).toBe(0);
		expect(b.layoutRect?.x).toBe(50);
	});

	test("padding insets children", () => {
		const child = node({ flexGrow: 1 });
		const root = node({ flexDirection: "column", padding: 5 }, [
			child,
		]);
		const bridge = new YogaBridge();
		build(bridge, root);
		bridge.calculate(root, 100, 80);
		expect(child.layoutRect).toEqual({ x: 5, y: 5, w: 90, h: 70 });
	});

	test("absolute position honours insets", () => {
		const child = node({
			position: "absolute",
			top: 10,
			left: 20,
			width: 30,
			height: 40,
		});
		const root = node({}, [child]);
		const bridge = new YogaBridge();
		build(bridge, root);
		bridge.calculate(root, 200, 100);
		expect(child.layoutRect).toEqual({ x: 20, y: 10, w: 30, h: 40 });
	});

	test("grid cell positions follow rows and gaps", () => {
		const cellSize = 16;
		const gap = 4;
		const cells = Array.from({ length: 4 }, () =>
			node({ width: cellSize, height: cellSize }),
		);
		const rowA = node({ flexDirection: "row", gap }, [
			cells[0]!,
			cells[1]!,
		]);
		const rowB = node({ flexDirection: "row", gap }, [
			cells[2]!,
			cells[3]!,
		]);
		const root = node({ flexDirection: "column", gap }, [rowA, rowB]);
		const bridge = new YogaBridge();
		build(bridge, root);
		bridge.calculate(root, 200, 200);
		expect(cells[0]!.layoutRect).toEqual({
			x: 0,
			y: 0,
			w: 16,
			h: 16,
		});
		expect(cells[1]!.layoutRect).toEqual({
			x: 20,
			y: 0,
			w: 16,
			h: 16,
		});
		expect(cells[2]!.layoutRect).toEqual({
			x: 0,
			y: 20,
			w: 16,
			h: 16,
		});
		expect(cells[3]!.layoutRect).toEqual({
			x: 20,
			y: 20,
			w: 16,
			h: 16,
		});
	});

	test("free clears the yoga handle and can run after create", () => {
		const child = node({ flexGrow: 1 });
		const root = node({}, [child]);
		const bridge = new YogaBridge();
		build(bridge, root);
		bridge.calculate(root, 50, 50);
		bridge.free(child);
		bridge.free(root);
		expect(child.yoga).toBeUndefined();
		expect(root.yoga).toBeUndefined();
	});

	test("recomputes after a structural change", () => {
		const a = node({ flexGrow: 1 });
		const root = node({ flexDirection: "row" }, [a]);
		const bridge = new YogaBridge();
		build(bridge, root);
		bridge.calculate(root, 100, 40);
		expect(a.layoutRect?.w).toBe(100);

		const b = node({ flexGrow: 1 });
		bridge.create(b);
		bridge.applyStyle(b, { flexGrow: 1 });
		root.children.push(b);
		bridge.calculate(root, 100, 40);
		expect(a.layoutRect?.w).toBe(50);
		expect(b.layoutRect).toEqual({ x: 50, y: 0, w: 50, h: 40 });
	});
});
