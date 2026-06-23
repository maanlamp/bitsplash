import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./editor/app";
import "./style/main.scss";

const runtimeReady = (async (): Promise<void> => {
	const [, rapier] = await Promise.all([
		import("./game/scenes/platformer"),
		import("./engine/physics/rapier-physics"),
	]);
	await rapier.loadRapier();
})();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App startScene="demo" runtimeReady={runtimeReady} />
	</StrictMode>,
);
