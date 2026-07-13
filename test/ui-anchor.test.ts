import { expect, test } from "bun:test";
import {
	AnchorSystem,
	type AnchorCamera,
	type AnchorFrame,
} from "../src/engine/ui/bypass/anchor-system";
import { DynStore } from "../src/engine/ui/bypass/dyn-store";
import type { UiAnchor } from "../src/engine/ui/reconciler/ui-elements";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import type { UiRoot } from "../src/engine/ui/reconciler/ui-root";

const identityCamera: AnchorCamera = {
	worldToScreenX: (x) => x,
	worldToScreenY: (y) => y,
};

const frame = (): AnchorFrame => ({
	camera: identityCamera,
	uiScale: 1,
	viewportWidth: 100,
	viewportHeight: 100,
});

let nextId = 100;
const anchoredNode = (anchor: UiAnchor): UiNode => ({
	type: "view",
	props: { anchor },
	children: [],
	id: nextId++,
});

const rootWith = (node: UiNode): UiRoot =>
	({
		tree: { type: "#root", props: {}, children: [node], id: 0 },
	}) as UiRoot;

const run = (anchor: UiAnchor): { dyn: DynStore; node: UiNode } => {
	const node = anchoredNode(anchor);
	const dyn = new DynStore();
	new AnchorSystem(rootWith(node), dyn, { inset: 10 }).update(
		frame(),
	);
	return { dyn, node };
};

test("on-screen anchor writes projected offset and stays visible", () => {
	const { dyn, node } = run({ world: { x: 40, y: 60 } });
	const values = dyn.get(node.id)!;
	expect(values.offsetX).toBe(40);
	expect(values.offsetY).toBe(60);
	expect(values.rotation).toBe(0);
	expect(values.visible).toBe(true);
});

test("off-screen anchor without edge-clamp is hidden", () => {
	const { dyn, node } = run({ world: { x: 250, y: 60 } });
	expect(dyn.get(node.id)?.visible).toBe(false);
});

test("off-screen anchor with edge-clamp clamps to the inset rect", () => {
	const { dyn, node } = run({
		world: { x: 250, y: 60 },
		edgeClamp: true,
	});
	const values = dyn.get(node.id)!;
	expect(values.offsetX).toBe(90);
	expect(values.offsetY).toBe(60);
	expect(values.visible).toBe(true);
	expect(values.rotation).toBeCloseTo(0, 6);
});

test("edge-clamped marker points upward toward an off-top target", () => {
	const { dyn, node } = run({
		world: { x: 50, y: -100 },
		edgeClamp: true,
	});
	const values = dyn.get(node.id)!;
	expect(values.offsetX).toBe(50);
	expect(values.offsetY).toBe(10);
	expect(values.rotation).toBeCloseTo(-Math.PI / 2, 6);
});

test("pointToward overrides the direction of an edge-clamped marker", () => {
	const { dyn, node } = run({
		world: { x: 250, y: 60 },
		edgeClamp: true,
		pointToward: { x: 0, y: 60 },
	});
	expect(dyn.get(node.id)?.rotation).toBeCloseTo(Math.PI, 6);
});

test("live world position from dyn overrides the anchor prop", () => {
	const node = anchoredNode({ world: { x: 40, y: 60 } });
	const dyn = new DynStore();
	dyn.set(node.id, { worldX: 10, worldY: 20 });
	new AnchorSystem(rootWith(node), dyn, { inset: 10 }).update(
		frame(),
	);
	const values = dyn.get(node.id)!;
	expect(values.offsetX).toBe(10);
	expect(values.offsetY).toBe(20);
});
