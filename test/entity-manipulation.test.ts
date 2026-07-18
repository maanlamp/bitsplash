import { beforeAll, describe, expect, test } from "bun:test";
import { Camera2D } from "../src/engine/camera/camera-2d";
import type { EntityId } from "../src/engine/ecs";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { PhysicsBodyComponent } from "../src/engine/physics/physics-body-component";
import { PhysicsSystem } from "../src/engine/physics/physics-system";
import {
	Scene,
	type SceneFile,
	toSceneConfig,
} from "../src/engine/scene/scene";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { World } from "../src/engine/world";
import { nudgeEntities } from "../src/editor/commands";
import type { EditorSettings } from "../src/editor/editor-settings";
import { EditorState } from "../src/editor/editor-state";
import { getPickIndex } from "../src/editor/pick-index";
import { SceneDocument } from "../src/editor/scene-document";
import { EntityEditorSystem } from "../src/editor/systems/entity-editor";

const loadRapierHeadless = (): Promise<void> =>
	loadRapier(async () => {
		const mod =
			(await import("@dimforge/rapier2d-compat")) as unknown as {
				init: () => Promise<void>;
			};
		await mod.init();
		return mod as never;
	});

const SETTINGS = {
	nudgeStep: 10,
	snapThreshold: 8,
} as unknown as EditorSettings;

type Fixture = ReturnType<typeof makeFixture>;

const makeFixture = () => {
	const config = toSceneConfig({ gravity: { x: 0, y: 0 } });
	const world = new World(config.gravity);
	const scene = new Scene({
		kind: "platformer",
		name: "test",
		config,
		world,
	});
	const baseline: SceneFile = {
		version: 1,
		kind: "platformer",
		config: { gravity: { x: 0, y: 0 } },
		entities: [],
	};
	const document = new SceneDocument(scene, baseline);
	const store = new EditorState();
	const editor = new EntityEditorSystem(store, document, SETTINGS);
	const camera = new Camera2D(Vector2.zero(), 1);
	const input = {
		mouse: {
			buttons: {} as Record<string, boolean>,
			position: new Vector2(0, 0),
			wheel: new Vector2(0, 0),
			inside: true,
			modifiers: {
				ctrl: false,
				shift: false,
				alt: false,
				meta: false,
			},
		},
		keyboard: { keys: {} as Record<string, boolean> },
		gamepads: {},
	};
	const ecs = world.ecs;
	const ctx = {
		ecs,
		input,
		assetManager: undefined,
		camera,
	} as unknown as UpdateContext;
	const stepEditor = (): void => {
		getPickIndex(ecs).maintain();
		editor.update(ctx);
	};
	const stepPhysics = (): void => {
		ecs.update({ dt: 16, ecs, world } as unknown as UpdateContext);
	};
	return {
		world,
		ecs,
		scene,
		document,
		store,
		editor,
		input,
		stepEditor,
		stepPhysics,
	};
};

const spawn = (
	fx: Fixture,
	x: number,
	y: number,
	withBody: boolean,
): EntityId => {
	const comps: object[] = [new TransformComponent(new Vector2(x, y))];
	if (withBody) {
		comps.push(new PhysicsBodyComponent("dynamic", 16, 16));
	}
	return fx.ecs.createEntity(comps);
};

const pos = (fx: Fixture, id: EntityId): Vector2 =>
	fx.ecs.getComponent(id, TransformComponent)!.position;

const body = (fx: Fixture, id: EntityId) =>
	fx.ecs.getComponent(id, PhysicsBodyComponent)!.body!;

const press = (fx: Fixture, x: number, y: number): void => {
	fx.input.mouse.position.set(x, y);
	fx.input.mouse.buttons.left = true;
	fx.stepEditor();
};

const moveTo = (fx: Fixture, x: number, y: number): void => {
	fx.input.mouse.position.set(x, y);
	fx.stepEditor();
};

const release = (fx: Fixture): void => {
	fx.input.mouse.buttons.left = false;
	fx.stepEditor();
};

describe("entity manipulation", () => {
	beforeAll(loadRapierHeadless);

	test("an N-entity group move commits one composite and teleports every body", () => {
		const fx = makeFixture();
		fx.world.ecs.addUpdateSystem(new PhysicsSystem());
		const a = spawn(fx, 100, 100, true);
		const b = spawn(fx, 200, 100, true);
		fx.stepPhysics(); // create the bodies at their authored positions

		body(fx, a).linearVelocity = { x: 5, y: 5 };
		body(fx, b).linearVelocity = { x: 5, y: 5 };
		fx.store.select([a, b]);

		fx.input.mouse.modifiers.ctrl = true; // escape snapping for an exact delta
		press(fx, 100, 100); // press on a → drag the whole selection
		moveTo(fx, 140, 124); // delta (+40, +24)
		release(fx);

		// Exactly one journal entry: the group move is one composite (two moves
		// would be length 2), one undo step.
		expect(fx.document.journal.length).toBe(1);

		expect(pos(fx, a).x).toBeCloseTo(140, 3);
		expect(pos(fx, a).y).toBeCloseTo(124, 3);
		expect(pos(fx, b).x).toBeCloseTo(240, 3);
		expect(pos(fx, b).y).toBeCloseTo(124, 3);

		// Every moved entity's body is teleported and its velocity zeroed.
		for (const id of [a, b]) {
			expect(body(fx, id).position.x).toBeCloseTo(pos(fx, id).x, 3);
			expect(body(fx, id).position.y).toBeCloseTo(pos(fx, id).y, 3);
			expect(body(fx, id).linearVelocity.x).toBeCloseTo(0, 3);
			expect(body(fx, id).linearVelocity.y).toBeCloseTo(0, 3);
		}

		// One undo reverts the whole group.
		fx.document.undo();
		expect(pos(fx, a).x).toBeCloseTo(100, 3);
		expect(pos(fx, b).x).toBeCloseTo(200, 3);
	});

	test("Alt-drag duplicates the selection then drags the copies", () => {
		const fx = makeFixture();
		fx.world.ecs.addUpdateSystem(new PhysicsSystem());
		const a = spawn(fx, 100, 100, true);
		fx.stepPhysics();
		fx.store.selectOne(a);

		fx.input.mouse.modifiers.alt = true;
		fx.input.mouse.modifiers.ctrl = true; // escape snapping
		press(fx, 100, 100); // duplicate a → copy at (132,132), select + drag it
		moveTo(fx, 110, 110); // delta (+10,+10)
		release(fx);

		// The original is untouched; a copy exists and is selected.
		expect(fx.ecs.entities()).toHaveLength(2);
		const copy = fx.ecs.entities().find((id) => id !== a)!;
		expect(fx.store.has(copy)).toBe(true);
		expect(fx.store.has(a)).toBe(false);
		expect(pos(fx, a).x).toBeCloseTo(100, 3);

		// The copy sits at the offset (one tile) + drag delta.
		expect(pos(fx, copy).x).toBeCloseTo(142, 3);
		expect(pos(fx, copy).y).toBeCloseTo(142, 3);

		// The copy's new physics body is created at the offset transform.
		fx.stepPhysics();
		expect(body(fx, copy).position.x).toBeCloseTo(142, 3);
		expect(body(fx, copy).position.y).toBeCloseTo(142, 3);
	});

	test("marquee box-selects intersecting entities via the pick index", () => {
		const fx = makeFixture();
		const a = spawn(fx, 100, 100, false);
		const b = spawn(fx, 200, 100, false);

		press(fx, 50, 50); // empty press → marquee
		moveTo(fx, 260, 160); // box over both
		release(fx);

		expect(fx.store.selectedCount).toBe(2);
		expect(fx.store.has(a)).toBe(true);
		expect(fx.store.has(b)).toBe(true);
	});

	test("an empty click without a drag clears the selection", () => {
		const fx = makeFixture();
		const a = spawn(fx, 100, 100, false);
		fx.store.selectOne(a);

		press(fx, 50, 50); // empty press
		release(fx); // no movement → click, not marquee

		expect(fx.store.selectedCount).toBe(0);
	});

	test("dragging snaps a salient point to the grid by default", () => {
		const fx = makeFixture();
		const a = spawn(fx, 100, 100, false); // fallback box 84..116

		fx.store.selectOne(a);
		press(fx, 100, 100);
		moveTo(fx, 105, 105); // raw delta (+5,+5)
		release(fx);

		// The min corner (89 after the raw move) snaps to grid line 96, so the
		// pivot lands at 112 and the box min sits on 96 (a multiple of 32).
		expect(pos(fx, a).x).toBeCloseTo(112, 3);
		expect(pos(fx, a).y).toBeCloseTo(112, 3);
		expect((pos(fx, a).x - 16) % 32).toBeCloseTo(0, 3);
	});

	test("Ctrl escapes snapping mid-drag for an exact delta", () => {
		const fx = makeFixture();
		const a = spawn(fx, 100, 100, false);

		fx.store.selectOne(a);
		fx.input.mouse.modifiers.ctrl = true;
		press(fx, 100, 100);
		moveTo(fx, 105, 105);
		release(fx);

		expect(pos(fx, a).x).toBeCloseTo(105, 3);
		expect(pos(fx, a).y).toBeCloseTo(105, 3);
	});

	test("nudge moves the selection and marks it dirty for the pick index", () => {
		const fx = makeFixture();
		const a = spawn(fx, 100, 100, false);
		fx.store.selectOne(a);
		getPickIndex(fx.ecs).maintain(); // index a at (100,100)

		nudgeEntities(fx.document, [a], 100, 0);

		expect(pos(fx, a).x).toBeCloseTo(200, 3);
		expect(pos(fx, a).y).toBeCloseTo(100, 3);
		expect(fx.document.journal.length).toBe(1);

		// The move marked the entity dirty: a reindex moves its AABB, so the old
		// location no longer picks and the new one does.
		getPickIndex(fx.ecs).maintain();
		const near = (x: number, y: number) =>
			getPickIndex(fx.ecs).search({
				minX: x - 1,
				minY: y - 1,
				maxX: x + 1,
				maxY: y + 1,
			});
		expect(near(100, 100)).not.toContain(a);
		expect(near(200, 100)).toContain(a);

		fx.document.undo();
		expect(pos(fx, a).x).toBeCloseTo(100, 3);
	});
});
