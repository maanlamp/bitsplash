import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";
import { isCharacterId } from "../src/game/character/character-ids";
import { standingTowardPlayer } from "../src/game/character/reputation";
import {
	STANDING_IDS,
	type StandingId,
} from "../src/game/character/standing-ids";
import { reactionsFor } from "../src/game/reaction/loader";

/**
 * Guards over the committed artifacts rather than the mechanism: a reacting
 * entity resolves its reputation standing through its `Character` component, so a
 * prefab or scene entity carrying `Reaction` without `Character` crashes the
 * frame it is first perceived on. That is exactly the kind of leak a green unit
 * test hides, so it is asserted against the JSON on disk.
 */

type Entity = Readonly<{
	components: Record<string, Record<string, unknown>>;
}>;

const read = (path: string): unknown =>
	JSON.parse(readFileSync(path, "utf8"));

const paths = (pattern: string): string[] => [
	...new Glob(pattern).scanSync("."),
];

const assertCharacterLink = (where: string, entity: Entity): void => {
	if (!("Reaction" in entity.components)) {
		return;
	}
	const character = entity.components.Character;
	expect(
		character,
		`${where} has Reaction but no Character`,
	).toBeDefined();
	const id = character!.character;
	expect(
		typeof id === "string" && isCharacterId(id),
		`${where} names unknown character ${JSON.stringify(id)}`,
	).toBe(true);
};

test("every prefab that reacts names which character it is", () => {
	const found = paths("src/game/content/prefabs/*.prefab.json");
	expect(found.length).toBeGreaterThan(0);
	for (const path of found) {
		assertCharacterLink(path, read(path) as Entity);
	}
});

test("every scene entity that reacts names which character it is", () => {
	const found = paths("src/game/content/levels/*.scene.json");
	expect(found.length).toBeGreaterThan(0);
	for (const path of found) {
		const scene = read(path) as Readonly<{
			entities: readonly (Entity & { id: string })[];
		}>;
		for (const entity of scene.entities) {
			assertCharacterLink(`${path} entity ${entity.id}`, entity);
		}
	}
});

/** Which standings the npc table admits for a given stimulus. */
const admitted = (stimulus: string): ReadonlySet<StandingId> => {
	const out = new Set<StandingId>();
	for (const def of reactionsFor("npc")) {
		if (def.stimulus !== stimulus) {
			continue;
		}
		for (const standing of def.standings) {
			out.add(standing);
		}
	}
	return out;
};

test("being noticed reads differently at every standing, and cold reads as silence", () => {
	const notice = admitted("noticed-friendly");

	for (const standing of STANDING_IDS) {
		expect(notice.has(standing)).toBe(standing !== "cold");
	}
});

test("the demo cast spans standings, so the difference is visible in play", () => {
	expect(standingTowardPlayer("bramble")).toBe("warm");
	expect(standingTowardPlayer("stranger")).toBe("wary");
	expect(standingTowardPlayer("pennywhistle")).toBe("neutral");
	expect(standingTowardPlayer("critter")).toBe("cold");
});
