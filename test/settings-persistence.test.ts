import { beforeAll, describe, expect, test } from "bun:test";
import {
	setViewMuted,
	WORKSPACE_VERSION,
	type Workspace,
} from "../src/editor/workspace/layout";
import {
	flushWorkspace,
	loadWorkspace,
	saveWorkspace,
} from "../src/editor/workspace/persist";
import { LocalStorageSettingsStore } from "../src/engine/input/local-storage-settings-store";
import { PlayerSettings } from "../src/engine/settings/player-settings";

/**
 * A setting that silently fails to persist looks identical to one the player
 * never changed, and nothing else in the project will ever surface it: there is
 * no UI test, and a human re-checking a volume after every reload is not a
 * plan. These are tripwires for that, not a lock on the settings UI.
 */

const storage = new Map<string, string>();

const isValid = (id: string): boolean => id !== "scene:gone";

const workspaceWith = (views: ReadonlyArray<string>): Workspace => ({
	version: WORKSPACE_VERSION,
	mutedViews: [],
	windows: [
		{
			id: "hub",
			focused: views[0] ?? null,
			root: {
				type: "tabs",
				id: "tg-test",
				views,
				active: views[0] ?? "",
			},
		},
	],
});

const installLocalStorage = (): void => {
	(globalThis as { localStorage?: Storage }).localStorage = {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => {
			storage.set(key, value);
		},
		removeItem: (key: string) => {
			storage.delete(key);
		},
		clear: () => storage.clear(),
		key: () => null,
		length: 0,
	} as Storage;
	(globalThis as { window?: unknown }).window ??= globalThis;
};

describe("player settings survive a reload", () => {
	beforeAll(installLocalStorage);

	test("every field round-trips through localStorage", () => {
		storage.clear();
		const first = new PlayerSettings(new LocalStorageSettingsStore());
		first.setMasterVolume(0.42);
		first.setVolume("ambience", 0.1);
		first.setVolume("sfx", 0.75);
		first.setVolume("voice", 0);
		first.setFlashIntensity(0.25);
		first.setCameraShake(0.5);
		first.setWeatherDensity(0.3);
		first.setScreenFades(false);
		first.setWeatherQuality("low");
		first.setAccessibilitySeen(true);

		const reloaded = new PlayerSettings(
			new LocalStorageSettingsStore(),
		);
		expect(reloaded.masterVolume).toBe(0.42);
		expect(reloaded.volume("ambience")).toBe(0.1);
		expect(reloaded.volume("sfx")).toBe(0.75);
		expect(reloaded.volume("voice")).toBe(0);
		expect(reloaded.flashIntensity).toBe(0.25);
		expect(reloaded.cameraShake).toBe(0.5);
		expect(reloaded.weatherDensity).toBe(0.3);
		expect(reloaded.screenFades).toBe(false);
		expect(reloaded.weatherQuality).toBe("low");
		expect(reloaded.accessibilitySeen).toBe(true);
	});

	test("a first launch defaults to the better-looking game, unseen", () => {
		storage.clear();
		const fresh = new PlayerSettings(new LocalStorageSettingsStore());
		expect(fresh.masterVolume).toBe(1);
		expect(fresh.flashIntensity).toBe(1);
		expect(fresh.cameraShake).toBe(1);
		expect(fresh.weatherDensity).toBe(1);
		expect(fresh.screenFades).toBe(true);
		expect(fresh.weatherQuality).toBe("high");
		expect(fresh.accessibilitySeen).toBe(false);
	});
});

describe("a scene view's mute survives the workspace", () => {
	beforeAll(installLocalStorage);

	test("a muted view is still muted after a reload", () => {
		storage.clear();
		const muted = setViewMuted(
			workspaceWith(["scene:demo", "scene:other"]),
			"scene:demo",
			true,
		);
		saveWorkspace(muted);
		flushWorkspace();

		const loaded = loadWorkspace(isValid, "scene:demo");
		expect(loaded.mutedViews).toEqual(["scene:demo"]);
	});

	test("unmuting persists too, rather than leaving the old flag behind", () => {
		storage.clear();
		const muted = setViewMuted(
			workspaceWith(["scene:demo"]),
			"scene:demo",
			true,
		);
		saveWorkspace(setViewMuted(muted, "scene:demo", false));
		flushWorkspace();

		expect(loadWorkspace(isValid, "scene:demo").mutedViews).toEqual(
			[],
		);
	});

	test("a mute for a view that no longer validates is dropped", () => {
		storage.clear();
		const muted = setViewMuted(
			workspaceWith(["scene:demo", "scene:gone"]),
			"scene:gone",
			true,
		);
		saveWorkspace(muted);
		flushWorkspace();

		expect(loadWorkspace(isValid, "scene:demo").mutedViews).toEqual(
			[],
		);
	});
});
