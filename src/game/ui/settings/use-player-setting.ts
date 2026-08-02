import { useSyncExternalStore } from "react";
import { playerSettings } from "../../../engine/settings/player-settings";

/**
 * Read one player setting and re-render when it changes.
 *
 * **Return the value and render the value returned.** Reading
 * `playerSettings.x` straight into the JSX while a subscribe-only hook sits
 * alongside it looks equivalent and is not: the React Compiler memoises a
 * component's markup on the reactive values that feed it, it cannot see a
 * mutable module singleton, and a component whose markup depends on nothing it
 * can track is computed once and cached for the life of the mount. The setting
 * then changes, the store notifies, the component re-renders — and hands back
 * the cached element with the old number in it until something unmounts it.
 *
 * @example
 * const master = usePlayerSetting(() => playerSettings.masterVolume);
 * return (
 *   <MenuSlider
 *     value={master}
 *     onChange={(v) => playerSettings.setMasterVolume(v)}
 *   />
 * );
 */
export const usePlayerSetting = <T>(read: () => T): T =>
	useSyncExternalStore(playerSettings.subscribe, read);
