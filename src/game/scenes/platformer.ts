import { DebugTagComponent } from "../../engine/debug/debug-tag-component";
import { registerScene } from "../../engine/scene/registry";
import { Scene } from "../../engine/scene/scene";
import { SpriteComponent } from "../../engine/sprite/sprite-component";
import { FontSettings } from "../../engine/text/font-settings";
import { TransformComponent } from "../../engine/transform-component";
import type Vector2 from "../../engine/vector2";
import { World } from "../../engine/world";
import { collisionMatrix } from "../collision";
import { editorEdit } from "../compositions";
import fsPixelSansUrl from "../content/assets/fs-pixel-sans-unicode.font.zip?url";
import tilesetUrl from "../content/assets/dirt.tileset.png";
import { createPlatformerActions } from "../input/platformer-actions";
import "../registrations";
import { migrateLegacyTiles } from "./migrate-legacy-tiles";

registerScene("platformer", ({ config, name, services }): Scene => {
	const world = new World(config.gravity, collisionMatrix);
	const ecs = world.ecs;
	const actions = createPlatformerActions(services.settings);

	const edit = editorEdit({
		settings: services.settings,
		gravityY: config.gravity.y,
	});
	for (const system of edit.update) {
		ecs.addUpdateSystem(system);
	}
	for (const system of edit.render) {
		ecs.addRenderSystem(system);
	}

	return new Scene({
		kind: "platformer",
		name,
		config,
		world,
		actions,
		defaultEntity: (position: Vector2) => [
			new TransformComponent(position),
			new SpriteComponent(),
			new DebugTagComponent(
				"entity",
				new FontSettings(fsPixelSansUrl),
			),
		],
		migrateFile: (file, sceneId) =>
			migrateLegacyTiles(file, sceneId, tilesetUrl),
	});
});

if (import.meta.hot) {
	import.meta.hot.accept(() => {
		window.location.reload();
	});
}
