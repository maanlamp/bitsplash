/**
 * The settings view's tabs, in the order they are shown.
 *
 * A tuple rather than four string literals scattered across the view, so a tab
 * that does not exist cannot be selected and `tsc` checks every reference.
 */
export const SETTINGS_TABS = [
	"audio",
	"video",
	"accessibility",
	"controls",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const SETTINGS_TAB_LABELS: Readonly<
	Record<SettingsTab, string>
> = {
	audio: "Audio",
	video: "Video",
	accessibility: "Accessibility",
	controls: "Controls",
};
