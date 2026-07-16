import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import { CharacterRevealedEvent } from "../../engine/dialogue/events";
import type { EntityId } from "../../engine/ecs";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import {
	DEFAULT_VOICE_BANK,
	isVoicedChar,
	type LoadedBank,
	loadBank,
	VOICE_BANKS,
	vowelIndexForChar,
} from "./voice-bank";
import { profiler } from "../../engine/profiling/profiler";
import { VoiceComponent } from "./voice-component";

const DEFAULT_VOICE = new VoiceComponent();
const FALLBACK_CPS = 24;

@profiler("Voice", "Dialogue")
export class VoiceSystem implements UpdateSystem {
	private banks = new Map<string, LoadedBank>();
	private loading = new Set<string>();
	private warmed = false;
	private takeCursor = new Map<string, number>();
	private acc = 0;
	private activeDialogue: EntityId | null = null;

	update({ events, audio, ecs }: UpdateContext): void {
		this.warm(audio);

		for (const event of events.read(CharacterRevealedEvent)) {
			if (!isVoicedChar(event.char)) {
				continue;
			}
			const dialogue = ecs.getComponent(
				event.dialogue,
				DialogueComponent,
			);
			if (!dialogue) {
				continue;
			}
			if (event.dialogue !== this.activeDialogue) {
				this.activeDialogue = event.dialogue;
				this.acc = 1;
			}

			const voice =
				(dialogue.source.id !== null
					? ecs.getComponent(dialogue.source.id, VoiceComponent)
					: null) ?? DEFAULT_VOICE;
			const bank =
				this.ensureBank(audio, voice.bank) ??
				this.ensureBank(audio, DEFAULT_VOICE_BANK);
			if (!bank || bank.avgDuration <= 0) {
				continue;
			}

			const cps = dialogue.cps > 0 ? dialogue.cps : FALLBACK_CPS;
			this.acc += voice.overlap / bank.avgDuration / cps;
			if (this.acc < 1) {
				continue;
			}
			this.acc -= 1;

			this.play(audio, bank, voice, event.char);
		}
	}

	private warm(audio: UpdateContext["audio"]): void {
		if (this.warmed) {
			return;
		}
		this.warmed = true;
		for (const id of Object.keys(VOICE_BANKS)) {
			this.ensureBank(audio, id);
		}
	}

	private ensureBank(
		audio: UpdateContext["audio"],
		id: string,
	): LoadedBank | null {
		const loaded = this.banks.get(id);
		if (loaded) {
			return loaded;
		}
		const url = VOICE_BANKS[id];
		if (!url || this.loading.has(id)) {
			return null;
		}
		this.loading.add(id);
		void loadBank(audio, url).then((bank) => {
			this.banks.set(id, bank);
			this.loading.delete(id);
		});
		return null;
	}

	private play(
		audio: UpdateContext["audio"],
		bank: LoadedBank,
		voice: VoiceComponent,
		char: string,
	): void {
		const vowel = vowelIndexForChar(char);
		const takes = bank.vowels[vowel];
		if (!takes || takes.length === 0) {
			return;
		}
		const key = `${voice.bank}:${vowel}`;
		const cursor = (this.takeCursor.get(key) ?? 0) % takes.length;
		this.takeCursor.set(key, cursor + 1);
		const take = takes[cursor]!;

		const detune =
			voice.basePitchSemitones * 100 +
			(Math.random() * 2 - 1) * voice.detuneSemitones * 100;
		audio.playBuffer(bank.buffer, {
			offset: take.offset,
			duration: take.duration,
			detune,
			gain: take.gain,
		});
	}
}
