import {
	AUDIO_CATEGORIES,
	type AudioCategory,
} from "../../../engine/audio/audio-bus";
import { playerSettings } from "../../../engine/settings/player-settings";
import { View } from "../../../engine/ui/reconciler/ui-elements";
import { MenuSlider } from "./settings-widgets";
import { usePlayerSetting } from "./use-player-setting";

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
	ambience: "Ambience",
	sfx: "Effects",
	voice: "Voice",
};

const column = { flexDirection: "column", gap: 4 } as const;

const MasterVolume = () => {
	const value = usePlayerSetting(() => playerSettings.masterVolume);
	return (
		<MenuSlider
			label="Master"
			value={value}
			onChange={(next) => playerSettings.setMasterVolume(next)}
		/>
	);
};

type CategoryVolumeProps = Readonly<{ category: AudioCategory }>;

const CategoryVolume = ({ category }: CategoryVolumeProps) => {
	const value = usePlayerSetting(() =>
		playerSettings.volume(category),
	);
	return (
		<MenuSlider
			label={CATEGORY_LABELS[category] ?? category}
			value={value}
			onChange={(next) => playerSettings.setVolume(category, next)}
		/>
	);
};

/**
 * The four volume controls: master, then one per {@link AUDIO_CATEGORIES}
 * entry. There is no Music control because the project has no music.
 *
 * A slider position is not a gain. These write the position straight to
 * `playerSettings`, and `applyVolumeSettings` puts it through `volumeGain` on
 * the way to the mixer — so 50% here is 50% as loud, not half the amplitude.
 *
 * One component per row rather than one for the whole tab: a row subscribes to
 * the single value it draws, which a hook can do and a loop cannot.
 */
export const AudioTab = () => (
	<View style={column}>
		<MasterVolume />
		{AUDIO_CATEGORIES.map((category) => (
			<CategoryVolume key={category} category={category} />
		))}
	</View>
);
