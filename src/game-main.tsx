import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GameApp } from "./game/shell/game-app";
import "./style/main.scss";

const ready = (async (): Promise<void> => {
	const [, rapier] = await Promise.all([
		import("./game/scenes/platformer"),
		import("./engine/physics/rapier-physics"),
	]);
	await rapier.loadRapier();
})();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<GameApp ready={ready} />
	</StrictMode>,
);
