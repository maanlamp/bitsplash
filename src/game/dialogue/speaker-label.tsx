import type { ColorInput } from "../../engine/render/color-resolver";
import type { FontSettings } from "../../engine/text/font-settings";
import { Text, View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";

const NAME: ColorInput = [1, 0.85, 0.4, 1];

const BACKING: Style = {
	paddingLeft: 3,
	paddingRight: 3,
	backgroundColor: [0, 0, 0, 0.7],
};

export type SpeakerLabelProps = Readonly<{
	/** The speaker's display name, from their descriptor — never their id. */
	name: string;
	/** The speaker's own typeface, so the label reads as theirs. */
	font: FontSettings;
}>;

/**
 * A speaker's name on its own backing, so it stays legible sitting outside the
 * bubble rather than inside the frame.
 *
 * It expects a single short name — a display name, not a sentence. A `text` node
 * paints its string unwrapped, so a name long enough to need wrapping would spill
 * past the backing.
 *
 * The label does not choose which side it hugs; the message composite sets that
 * on the column it lives in.
 *
 * @example
 * const { displayName, font } = characterById(message.characterId);
 * <SpeakerLabel name={displayName} font={font} />
 */
export const SpeakerLabel = ({ name, font }: SpeakerLabelProps) => (
	<View style={BACKING}>
		<Text style={{ font, color: NAME }}>{name}</Text>
	</View>
);
