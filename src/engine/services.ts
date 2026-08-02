import type AssetManager from "./assets";
import type { AudioApi } from "./audio/audio-api";
import type { Clock } from "./clock";
import type EventBus from "./events";
import type { Input } from "./input/input";
import type { SettingsStore } from "./input/settings-store";

export type GlobalServices = Readonly<{
	input: Input;
	assetManager: AssetManager;
	audio: AudioApi;
	clock: Clock;
	events: EventBus;
	settings: SettingsStore;
}>;
