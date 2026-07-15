import { Glob } from "bun";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Camera2DComponent } from "../src/engine/camera/camera-2d-component";
import { Camera2DFollowComponent } from "../src/engine/camera/camera-2d-follow-component";
import { CameraTransitionComponent } from "../src/engine/camera/camera-transition-component";
import { ECS } from "../src/engine/ecs";
import { ScreenFadeComponent } from "../src/engine/fade/screen-fade-component";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import { runtimeTypeNames } from "../src/engine/serialization/registry";
import {
	serializeEntity,
	serializeWorld,
} from "../src/engine/serialization/serialize";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";

// Importing the runtime components registers their @serializable(runtime:true)
// flag so runtimeTypeNames() is populated for the guard below.
void [
	Camera2DComponent,
	Camera2DFollowComponent,
	CameraTransitionComponent,
	ScreenFadeComponent,
	SequenceComponent,
];

describe("authored serialization scope", () => {
	test("authored scope drops runtime-only entities, keeps authored ones", () => {
		const ecs = new ECS();
		const prop = ecs.createEntity([
			new TransformComponent(new Vector2(5, 5)),
		]);
		const camera = ecs.createEntity([
			new Camera2DComponent(),
			new Camera2DFollowComponent({ targets: [prop] }),
		]);

		const ids = serializeWorld(ecs, undefined, "authored").map(
			(entity) => entity.id,
		);

		expect(ids).toContain(prop);
		expect(ids).not.toContain(camera);
	});

	test("runtime scope keeps camera state for save-games and freeze/thaw", () => {
		const ecs = new ECS();
		const camera = ecs.createEntity([new Camera2DComponent()]);

		const runtimeIds = serializeWorld(ecs).map((entity) => entity.id);
		expect(runtimeIds).toContain(camera);

		expect(serializeEntity(ecs, camera, "authored")).toBeNull();
	});

	test("authored scope strips only the runtime components of a mixed entity", () => {
		const ecs = new ECS();
		const id = ecs.createEntity([
			new TransformComponent(new Vector2(1, 2)),
			new CameraTransitionComponent(),
		]);

		const entity = serializeEntity(ecs, id, "authored")!;
		expect(Object.keys(entity.components)).toEqual(["Transform"]);

		const runtimeEntity = serializeEntity(ecs, id)!;
		expect(Object.keys(runtimeEntity.components).sort()).toEqual([
			"CameraTransition",
			"Transform",
		]);
	});
});

// The regression guard the isolated mechanism tests missed: a stale editor
// camera was baked into demo.scene.json because one save path bypassed the
// authored filter. A level file must never contain runtime-provenance
// components regardless of how it was written.
describe("committed level files", () => {
	test("contain no runtime-provenance components", () => {
		const runtime = runtimeTypeNames();
		expect(runtime.size).toBeGreaterThan(0);

		const files = [...new Glob("src/**/*.scene.json").scanSync(".")];
		expect(files.length).toBeGreaterThan(0);

		const violations: string[] = [];
		for (const path of files) {
			const file = JSON.parse(readFileSync(path, "utf8")) as {
				entities?: ReadonlyArray<{
					id: string;
					components?: Record<string, unknown>;
				}>;
			};
			for (const entity of file.entities ?? []) {
				for (const name of Object.keys(entity.components ?? {})) {
					if (runtime.has(name)) {
						violations.push(`${path}: ${entity.id} → ${name}`);
					}
				}
			}
		}

		expect(violations).toEqual([]);
	});
});
