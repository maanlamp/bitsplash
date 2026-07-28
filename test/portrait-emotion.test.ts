import { expect, test } from "bun:test";
import { createElement } from "react";
import type { TileSource } from "../src/engine/render/renderer-2d";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import {
	Portrait,
	PortraitFlipped,
} from "../src/game/dialogue/portrait";
import { EMOTION_CELLS } from "../src/game/reaction/emotion-icon-atlas";
import type { ResolvedEmotionIcon } from "../src/game/reaction/resolve-emotion-icon";
import type { PortraitFrame } from "../src/game/dialogue/conversation-view";
import { headlessUi, mountSync } from "./support/ui-fixture";

const sheet = (name: string): TileSource =>
	({ src: name }) as unknown as TileSource;

const FRAME: PortraitFrame = {
	image: sheet("player"),
	x: 1815,
	y: 0,
	width: 40,
	height: 40,
};

const icon = (
	emotion: keyof typeof EMOTION_CELLS,
): ResolvedEmotionIcon => ({
	image: sheet("emotions"),
	...EMOTION_CELLS[emotion],
});

/** The `image` children of the mounted portrait box, in render order. */
const images = (
	element: Parameters<typeof mountSync>[1],
): readonly UiNode[] => {
	const ui = headlessUi();
	mountSync(ui, element);
	const box = ui.root.tree.children[0]!;
	return box.children.filter((child) => child.type === "image");
};

test("a portrait with no emotion draws only the character crop", () => {
	const drawn = images(createElement(Portrait, { frame: FRAME }));

	expect(drawn).toHaveLength(1);
	expect(drawn[0]!.props.srcX).toBe(FRAME.x);
});

test("an emotion overlays the portrait as a second cropped image", () => {
	const drawn = images(
		createElement(Portrait, {
			frame: FRAME,
			emotion: icon("angry"),
		}),
	);

	expect(drawn).toHaveLength(2);
	expect({
		srcX: drawn[1]!.props.srcX,
		srcY: drawn[1]!.props.srcY,
		srcW: drawn[1]!.props.srcW,
		srcH: drawn[1]!.props.srcH,
	}).toEqual(EMOTION_CELLS.angry);
});

test("the badge sits on the outer edge of whichever portrait shows it", () => {
	const left = images(
		createElement(Portrait, {
			frame: FRAME,
			emotion: icon("happy"),
		}),
	);
	const right = images(
		createElement(PortraitFlipped, {
			frame: FRAME,
			emotion: icon("happy"),
		}),
	);

	expect(left[1]!.props.style).toMatchObject({ left: 0 });
	expect(right[1]!.props.style).toMatchObject({ right: 0 });
});

test("a badge still shows while the character sprite is loading", () => {
	const drawn = images(
		createElement(Portrait, {
			frame: null,
			emotion: icon("thinking"),
		}),
	);

	expect(drawn).toHaveLength(1);
	expect(drawn[0]!.props.srcX).toBe(EMOTION_CELLS.thinking.srcX);
});
