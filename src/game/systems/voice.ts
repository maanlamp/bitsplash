import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import voiceUrl from "../assets/voice_01.wav?url";
import { CharacterRevealedEvent } from "../events";

const VOICE_CLIP = voiceUrl;

const charToPitch = (char: string): number =>
	2 ** (((char.charCodeAt(0) % 13) - 6) / 12);

export class VoiceSystem implements UpdateSystem {
	update({ events, audio }: UpdateContext): void {
		for (const event of events.read(CharacterRevealedEvent)) {
			audio.play(VOICE_CLIP, { pitch: charToPitch(event.char) });
		}
	}
}
