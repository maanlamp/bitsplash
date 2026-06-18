import { Game } from "../../engine/game";
import { Scene, toSceneConfig } from "../../engine/scene/scene";
import { World } from "../../engine/world";

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
		gameplaySystems: [],
	});
	game.sceneManager.setBase(scene);
	return { game, scene };
};
