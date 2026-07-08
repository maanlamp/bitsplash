import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { DEFAULT_VOICE_BANK } from "./voice-bank";

@serializable("Voice")
export class VoiceComponent {
	@serialize({ group: "voice" }) bank: string;
	@serialize({ group: "voice" }) basePitchSemitones: number;
	@serialize({ group: "voice" }) detuneSemitones: number;
	@serialize({ group: "voice" }) overlap: number;

	constructor(
		bank: string = DEFAULT_VOICE_BANK,
		basePitchSemitones = 0,
		detuneSemitones = 1.5,
		overlap = 1.7,
	) {
		this.bank = bank;
		this.basePitchSemitones = basePitchSemitones;
		this.detuneSemitones = detuneSemitones;
		this.overlap = overlap;
	}
}
