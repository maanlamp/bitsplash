import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import {
	richText,
	type RichLine,
} from "../src/engine/text/rich-text";
import { World } from "../src/engine/world";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

const line = (text: string): RichLine => ({
	glyphs: Array.from(text).map((char, i) => ({
		glyphId: char.codePointAt(0) ?? 0,
		style: 0 as never,
		x: i * 10,
		char,
		color: null,
		wave: null,
		speed: 1,
	})),
});

test("mid-dialogue standalone state round-trips to the same line", () => {
	const source = new World({ x: 0, y: 20 });

	const npcId = source.ecs.createEntity([]);

	const pages: RichLine[][] = [
		[line("Welcome, traveler.")],
		[line("The road ahead is dark.")],
	];

	const dialogue = new DialogueComponent(npcId);
	dialogue.speaker = "Elder";
	dialogue.text = "Welcome, traveler. The road ahead is dark.";
	dialogue.paginated = true;
	dialogue.pages = pages;
	dialogue.pageIndex = 1;
	dialogue.revealed = 5;
	dialogue.choices = ["Yes", "No", "Tell me more"];
	dialogue.selectedOption = 2;
	dialogue.opened = true;
	dialogue.phase = "open";

	const dialogueId = source.ecs.createEntity([dialogue]);

	const snapshot = serializeWorld(source.ecs);
	const entity = snapshot.find((e) => e.id === dialogueId);
	expect(entity).toBeDefined();
	expect(entity!.components).toHaveProperty("Dialogue");

	const target = new World({ x: 0, y: 20 });
	deserializeWorld(target, snapshot);

	const restored = target.ecs.getComponent(
		dialogueId,
		DialogueComponent,
	);
	expect(restored).toBeInstanceOf(DialogueComponent);
	if (!restored) {
		return;
	}

	expect(restored.pageIndex).toBe(1);
	expect(restored.revealed).toBe(5);
	expect(restored.paginated).toBe(true);
	expect(restored.opened).toBe(true);
	expect(restored.phase).toBe("open");
	expect(restored.speaker).toBe("Elder");
	expect(restored.text).toBe(
		"Welcome, traveler. The road ahead is dark.",
	);
	expect(restored.choices).toEqual(["Yes", "No", "Tell me more"]);
	expect(restored.selectedOption).toBe(2);
	expect(restored.pages.map(richText)).toEqual(pages.map(richText));
	expect(restored.source.id).toBe(npcId);
});

test("purged dialogue source restores as a resolvable soft ref", () => {
	const source = new World({ x: 0, y: 20 });
	const dialogue = new DialogueComponent(null);
	dialogue.opened = true;
	dialogue.phase = "open";
	dialogue.text = "A voice with no speaker.";
	const dialogueId = source.ecs.createEntity([dialogue]);

	const snapshot = serializeWorld(source.ecs);
	const target = new World({ x: 0, y: 20 });
	deserializeWorld(target, snapshot);

	const restored = target.ecs.getComponent(
		dialogueId,
		DialogueComponent,
	);
	expect(restored).toBeInstanceOf(DialogueComponent);
	expect(restored?.source.id).toBeNull();
});
