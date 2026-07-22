import { describe, expect, test } from "bun:test";
import { SpriteEditorState } from "../src/editor/sprite/sprite-editor-state";
import { DEFAULT_MODIFIERS } from "../src/editor/sprite/sprite-modifiers";

describe("sprite editor tool state", () => {
	test("defaults to the brush tool", () => {
		expect(new SpriteEditorState().tool).toBe("brush");
	});

	test("setTool switches the committed tool and notifies", () => {
		const state = new SpriteEditorState();
		let notifications = 0;
		state.subscribe(() => notifications++);

		state.setTool("eraser");
		expect(state.tool).toBe("eraser");
		expect(notifications).toBe(1);

		state.setTool("eraser");
		expect(notifications).toBe(1);
	});

	test("temporary tool push/pop restores the previous tool", () => {
		const state = new SpriteEditorState();
		state.setTool("eraser");

		state.pushTemporaryTool("pan");
		expect(state.tool).toBe("pan");

		state.popTemporaryTool();
		expect(state.tool).toBe("eraser");
	});

	test("temporary tool stack is last-in-first-out", () => {
		const state = new SpriteEditorState();
		state.setTool("brush");

		state.pushTemporaryTool("pan");
		state.pushTemporaryTool("eraser");
		expect(state.tool).toBe("eraser");

		state.popTemporaryTool();
		expect(state.tool).toBe("pan");
		state.popTemporaryTool();
		expect(state.tool).toBe("brush");
	});

	test("popping an empty stack is a no-op and does not notify", () => {
		const state = new SpriteEditorState();
		let notifications = 0;
		state.subscribe(() => notifications++);

		state.popTemporaryTool();
		expect(state.tool).toBe("brush");
		expect(notifications).toBe(0);
	});

	test("setTool under an active hold changes what pop restores, not the active tool", () => {
		const state = new SpriteEditorState();
		state.setTool("brush");
		state.pushTemporaryTool("pan");

		state.setTool("eraser");
		expect(state.tool).toBe("pan");

		state.popTemporaryTool();
		expect(state.tool).toBe("eraser");
	});

	test("push/pop notify only when the active tool actually changes", () => {
		const state = new SpriteEditorState();
		let notifications = 0;
		state.subscribe(() => notifications++);

		state.pushTemporaryTool("brush");
		expect(state.tool).toBe("brush");
		expect(notifications).toBe(0);

		state.popTemporaryTool();
		expect(notifications).toBe(0);
	});
});

describe("sprite editor modifiers", () => {
	test("default modifiers reproduce legacy behaviour", () => {
		expect(new SpriteEditorState().modifiers).toEqual(
			DEFAULT_MODIFIERS,
		);
	});

	test("setters update individual modifiers and notify once", () => {
		const state = new SpriteEditorState();
		let notifications = 0;
		state.subscribe(() => notifications++);

		state.setInk("alpha-lock");
		expect(state.modifiers.ink).toBe("alpha-lock");

		state.setSymmetry("horizontal");
		expect(state.modifiers.symmetry).toBe("horizontal");

		state.setPixelPerfect(true);
		expect(state.modifiers.pixelPerfect).toBe(true);

		state.setStabilizer(4);
		expect(state.modifiers.stabilizer).toBe(4);

		expect(notifications).toBe(4);
	});

	test("setting a modifier to its current value does not notify", () => {
		const state = new SpriteEditorState();
		let notifications = 0;
		state.subscribe(() => notifications++);

		state.setInk("normal");
		state.setSymmetry("off");
		state.setPixelPerfect(false);
		state.setStabilizer(0);
		expect(notifications).toBe(0);
	});

	test("modifier changes leave other modifiers untouched", () => {
		const state = new SpriteEditorState();
		state.setInk("shading");
		state.setStabilizer(2);
		expect(state.modifiers).toEqual({
			ink: "shading",
			symmetry: "off",
			pixelPerfect: false,
			stabilizer: 2,
		});
	});
});
