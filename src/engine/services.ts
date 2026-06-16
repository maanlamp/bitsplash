import type AssetManager from "./assets";
import type AudioManager from "./audio/audio";
import type { Clock } from "./clock";
import type EventBus from "./events";
import type { Input } from "./input/input";

export type GlobalServices = Readonly<{
	input: Input;
	assetManager: AssetManager;
	audio: AudioManager;
	clock: Clock;
	events: EventBus;
}>;
