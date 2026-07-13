import { GameShell } from "./game/shell/game-shell";
import "./style/main.scss";

const ready = (async (): Promise<void> => {
	const [, rapier] = await Promise.all([
		import("./game/scenes/platformer"),
		import("./engine/physics/rapier-physics"),
	]);
	await rapier.loadRapier();
})();

const root = document.getElementById("root")!;
root.textContent = "Loading…";

void ready.then(() => {
	root.textContent = "";
	const shell = new GameShell();
	shell.attach(root);
	shell.start();
});
