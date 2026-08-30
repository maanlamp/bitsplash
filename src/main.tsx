import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./editor/app";
import "./editor/console/console-capture";
import "./game/registrations";
import { createPlatformerGameModule } from "./game/shell/platformer-runtime";
import "./style/main.scss";

const gameModule = createPlatformerGameModule();

const runtimeReady = (async (): Promise<void> => {
	const [, rapier] = await Promise.all([
		import("./game/scenes/platformer"),
		import("./engine/physics/rapier-physics"),
	]);
	await rapier.loadRapier();
	// Read by `scripts/perf-dev-startup.ts` to separate "the editor painted"
	// from "the game runtime is actually usable".
	performance.mark("runtime-live");
})();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App
			startScene="demo"
			runtimeReady={runtimeReady}
			gameModule={gameModule}
		/>
	</StrictMode>,
);
