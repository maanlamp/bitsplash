import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./editor/app";
import { loadRapier } from "./engine/physics/rapier-physics";
import "./game/scenes/platformer";
import "./style/main.scss";

await loadRapier();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App startScene="demo" />
	</StrictMode>,
);
