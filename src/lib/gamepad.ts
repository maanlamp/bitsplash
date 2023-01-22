import { Game } from "lib/game";
import { useEffect } from "react";

const useGamepad = (game: Game) => {
	useEffect(() => {
		const attachGamepad = (e: GamepadEvent) => game.registerGamepad(e.gamepad);

		const detachGamepad = (e: GamepadEvent) =>
			game.unregisterGamepad(e.gamepad);

		window.addEventListener("gamepadconnected", attachGamepad);
		window.addEventListener("gamepaddisconnected", detachGamepad);

		return () => {
			window.removeEventListener("gamepadconnected", attachGamepad);
			window.removeEventListener("gamepaddisconnected", detachGamepad);
		};
	}, []);
};

export default useGamepad;
