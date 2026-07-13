import { ActionResolver } from "../../engine/input/bindings/action-resolver";
import { BindingsPersistence } from "../../engine/input/bindings/settings-persistence";
import type { SettingsStore } from "../../engine/input/settings-store";
import { platformerCatalog } from "./platformer-catalog";

const ID_MIGRATIONS: Readonly<Record<string, string>> = {};

export const createPlatformerActions = (
	settings: SettingsStore,
): ActionResolver => {
	const { bindings } = new BindingsPersistence(settings).load(
		platformerCatalog,
		ID_MIGRATIONS,
	);
	return new ActionResolver(platformerCatalog, settings, bindings);
};
