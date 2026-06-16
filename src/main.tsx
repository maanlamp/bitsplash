import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./editor/app";
import "./game/scenes/platformer";
import "./style/main.scss";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App defaultScene="platformer" />
	</StrictMode>,
);
