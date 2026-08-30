import { expect, test } from "bun:test";
import { createElement } from "react";
import { ECS } from "../src/engine/ecs";
import type { RenderContext } from "../src/engine/system";
import {
	View,
	type ViewProps,
} from "../src/engine/ui/reconciler/ui-elements";
import type { UiRuntime } from "../src/engine/ui/ui-runtime";
import { findById } from "../src/engine/ui/input/node-tree";
import { headlessUi, mountSync } from "./support/ui-fixture";

type PaintedRect = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;

type RectRecorder = Readonly<{
	rects: PaintedRect[];
	ctx: RenderContext;
}>;

const recorder = (): RectRecorder => {
	const rects: PaintedRect[] = [];
	const renderer = {
		drawRect: (_layer: number, opts: PaintedRect) => {
			rects.push({
				x: opts.x,
				y: opts.y,
				width: opts.width,
				height: opts.height,
			});
		},
		pushClip: () => {},
		popClip: () => {},
	};
	return {
		rects,
		ctx: {
			ecs: new ECS(),
			renderer,
			time: { elapsed: 0 },
		} as unknown as RenderContext,
	};
};

const render = (ui: UiRuntime): PaintedRect[] => {
	const { rects, ctx } = recorder();
	ui.paintSystem.render(ctx);
	return rects;
};

const BUBBLE: ViewProps = {
	id: "bubble",
	worldLayer: "overlay",
	style: {
		position: "absolute",
		width: 40,
		height: 12,
		backgroundColor: [1, 1, 1, 1],
	},
};

const mountBubble = (props: ViewProps = BUBBLE) => {
	const ui = headlessUi();
	mountSync(ui, createElement(View, props));
	ui.layout(1, 200, 200);
	const nodeId = findById(ui.root.tree, props.id!)!.id;
	return { ui, nodeId };
};

test("a world-anchored node with no dyn offset still anchors by its top-left", () => {
	const { ui, nodeId } = mountBubble();
	ui.dyn.set(nodeId, { worldX: 100, worldY: 50 });

	expect(render(ui)).toEqual([
		{ x: 100, y: 50, width: 40, height: 12 },
	]);
});

test("dyn offsets shift a world-anchored node off its anchor point", () => {
	const { ui, nodeId } = mountBubble();
	ui.dyn.set(nodeId, {
		worldX: 100,
		worldY: 50,
		offsetX: -20,
		offsetY: -12,
	});

	expect(render(ui)).toEqual([
		{ x: 80, y: 38, width: 40, height: 12 },
	]);
});

test("an offset world-anchored node stays unpainted until it has a measured width", () => {
	const { ui, nodeId } = mountBubble({
		id: "bubble",
		worldLayer: "overlay",
		style: {
			position: "absolute",
			backgroundColor: [1, 1, 1, 1],
		},
	});
	ui.dyn.set(nodeId, {
		worldX: 100,
		worldY: 50,
		offsetX: 0,
		offsetY: 0,
	});

	expect(render(ui)).toEqual([]);
});

test("a zero-size world-anchored wrapper still paints its children", () => {
	const ui = headlessUi();
	mountSync(
		ui,
		createElement(
			View,
			{
				id: "wrapper",
				worldLayer: "overlay",
				style: { position: "absolute" },
			},
			createElement(View, {
				id: "bar",
				style: {
					position: "absolute",
					left: -16,
					top: 0,
					width: 32,
					height: 4,
					backgroundColor: [1, 1, 1, 1],
				},
			}),
		),
	);
	ui.layout(1, 200, 200);
	const wrapperId = findById(ui.root.tree, "wrapper")!.id;
	ui.dyn.set(wrapperId, { worldX: 100, worldY: 50 });

	expect(render(ui)).toEqual([
		{ x: 84, y: 50, width: 32, height: 4 },
	]);
});
