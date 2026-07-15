import { Game } from "../../engine/game";
import { Scene, toSceneConfig } from "../../engine/scene/scene";
import { World } from "../../engine/world";

/**
 * A throwaway single-scene {@link Game} for a sprite-editor preview panel. The
 * sprite editor is a render scaffold (not a document projection): callers add
 * their preview render/update systems to `scene.ecs` and drive it with
 * {@link Game.start}.
 */
export const createPreviewGame = (): Readonly<{
	game: Game;
	scene: Scene;
}> => {
	const game = new Game({});
	const world = new World({ x: 0, y: 0 });
	const scene = new Scene({
		kind: "preview",
		name: "preview",
		config: toSceneConfig({ gravity: { x: 0, y: 0 } }),
		world,
	});
	game.setScene(scene);
	return { game, scene };
};
