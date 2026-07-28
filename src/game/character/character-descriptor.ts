import type { SpriteTag } from "../../engine/sprite/sprite-tag";
import type { FontSettings } from "../../engine/text/font-settings";
import {
	PlayerSprite,
	VoiceBanks,
} from "../content/assets/assets.gen";
import type { VoiceBankId } from "../dialogue/voice-bank-id";
import {
	CARTRIDGE_FONT,
	COMICORO_FONT,
	DEFAULT_FONT,
	DOUBLEHOMICIDE_FONT,
} from "../dialogue/ink-fonts";
import type { CharacterId } from "./character-ids";

/**
 * Everything the presentation layer needs to portray one speaker: how they are
 * named, cropped, typeset, voiced, and which side of the conversation panel they
 * sit on.
 *
 * `portrait` and `voiceBank` are branded, so both can only come from the
 * generated accessor module — a dangling reference fails at `bun run gen` and at
 * `tsc`, never as a wrong crop or a silent line.
 */
export type CharacterDescriptor = Readonly<{
	displayName: string;
	portrait: SpriteTag;
	font: FontSettings;
	voiceBank: VoiceBankId;
	isPlayer: boolean;
}>;

/**
 * The one humanoid sheet every portrait crops from. Per-character art is a
 * descriptor edit once more sheets exist.
 */
export const PORTRAIT_SHEET_URL: string = PlayerSprite.url;

/**
 * Every speaker's descriptor, keyed by {@link CharacterId}.
 *
 * Display name and id deliberately diverge: `stranger` is nameless by design and
 * `pennywhistle` is addressed by rank.
 */
export const CHARACTERS: Record<CharacterId, CharacterDescriptor> = {
	player: {
		displayName: "You",
		portrait: PlayerSprite.portrait,
		font: COMICORO_FONT,
		voiceBank: VoiceBanks.child,
		isPlayer: true,
	},
	bramble: {
		displayName: "Bramble",
		portrait: PlayerSprite.portrait,
		font: CARTRIDGE_FONT,
		voiceBank: VoiceBanks.smooth,
		isPlayer: false,
	},
	pennywhistle: {
		displayName: "Sergeant Pennywhistle",
		portrait: PlayerSprite.portrait,
		font: DOUBLEHOMICIDE_FONT,
		voiceBank: VoiceBanks.brute,
		isPlayer: false,
	},
	quartermaster: {
		displayName: "Quartermaster",
		portrait: PlayerSprite.portrait,
		font: CARTRIDGE_FONT,
		voiceBank: VoiceBanks.grunt,
		isPlayer: false,
	},
	quickfoot: {
		displayName: "Quickfoot",
		portrait: PlayerSprite.portrait,
		font: DOUBLEHOMICIDE_FONT,
		voiceBank: VoiceBanks.silly,
		isPlayer: false,
	},
	stranger: {
		displayName: "Stranger",
		portrait: PlayerSprite.portrait,
		font: DOUBLEHOMICIDE_FONT,
		voiceBank: VoiceBanks.smooth,
		isPlayer: false,
	},
	critter: {
		displayName: "Critter",
		portrait: PlayerSprite.portrait,
		font: DEFAULT_FONT,
		voiceBank: VoiceBanks.sign,
		isPlayer: false,
	},
	raider: {
		displayName: "Raider",
		portrait: PlayerSprite.portrait,
		font: DEFAULT_FONT,
		voiceBank: VoiceBanks.sign,
		isPlayer: false,
	},
	signpost: {
		displayName: "Signpost",
		portrait: PlayerSprite.portrait,
		font: DOUBLEHOMICIDE_FONT,
		voiceBank: VoiceBanks.sign,
		isPlayer: false,
	},
};

/**
 * Resolve a descriptor for an already-narrowed id.
 *
 * Narrowing is a separate step and belongs at the boundary an untrusted string
 * arrives on — an ink `# speaker:` tag, an authored reaction table entry — where
 * `isCharacterId` throws with the offending value in hand. By the time an id
 * reaches here it is a {@link CharacterId}, so there is no failure to handle.
 *
 * @example
 * const { displayName, font } = characterById(message.characterId);
 */
export const characterById = (id: CharacterId): CharacterDescriptor =>
	CHARACTERS[id];
