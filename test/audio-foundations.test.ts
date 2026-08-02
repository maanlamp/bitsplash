import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import AudioManager from "../src/engine/audio/audio";
import { applyVolumeSettings } from "../src/engine/audio/apply-volume-settings";
import { AUDIO_CATEGORIES } from "../src/engine/audio/audio-bus";
import {
	AudioFocus,
	audioOwnerOf,
	type FocusRealm,
} from "../src/engine/audio/audio-focus";
import { nullBus } from "../src/engine/audio/null-audio-bus";
import { NullAudioManager } from "../src/engine/audio/null-audio-manager";
import { PlayerSettings } from "../src/engine/settings/player-settings";
import { volumeGain } from "../src/engine/settings/volume-gain";
import type { SettingsStore } from "../src/engine/input/settings-store";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { World } from "../src/engine/world";

/**
 * Three tripwires over the audio foundations, and nothing else.
 *
 * Audio cannot be judged by an agent, so the parts that are pure logic are the
 * only ones that can be checked at all — and each of these fails silently:
 * gain staging that is wrong by a factor nobody notices until a mix is built on
 * it, a loop that outlives the world that started it, and a focus rule that
 * leaves two windows both sounding.
 */

// ---------------------------------------------------------------------------
// A fake WebAudio, recording every AudioParam write the real AudioManager makes.
// ---------------------------------------------------------------------------

type ParamCall = Readonly<{
	param: string;
	method: string;
	/** The `AudioParam` time argument. */
	time: number;
	/** The context time when the call was made. */
	now: number;
}>;

let paramCalls: ParamCall[] = [];
let clock = 0;

class FakeParam {
	value = 0;

	constructor(private readonly name: string) {}

	private record(method: string, time: number): void {
		paramCalls.push({ param: this.name, method, time, now: clock });
	}

	setTargetAtTime(value: number, time: number): void {
		this.value = value;
		this.record("setTargetAtTime", time);
	}

	setValueAtTime(value: number, time: number): void {
		this.value = value;
		this.record("setValueAtTime", time);
	}

	linearRampToValueAtTime(_value: number, time: number): void {
		this.record("linearRampToValueAtTime", time);
	}

	exponentialRampToValueAtTime(_value: number, time: number): void {
		this.record("exponentialRampToValueAtTime", time);
	}

	cancelAndHoldAtTime(time: number): void {
		this.record("cancelAndHoldAtTime", time);
	}

	cancelScheduledValues(time: number): void {
		this.record("cancelScheduledValues", time);
	}
}

class FakeNode {
	connect(target: unknown): unknown {
		return target;
	}
	disconnect(): void {}
}

class FakeGain extends FakeNode {
	readonly gain = new FakeParam("gain");
	constructor(_ctx: unknown, opts?: { gain?: number }) {
		super();
		this.gain.value = opts?.gain ?? 1;
	}
}

class FakePanner extends FakeNode {
	readonly pan = new FakeParam("pan");
	constructor(_ctx: unknown, _opts?: unknown) {
		super();
	}
}

class FakeFilter extends FakeNode {
	readonly frequency = new FakeParam("frequency");
	readonly Q = new FakeParam("Q");
	type = "lowpass";
	constructor(_ctx: unknown, _opts?: unknown) {
		super();
	}
}

class FakeSource extends FakeNode {
	readonly detune = new FakeParam("detune");
	onended: (() => void) | null = null;
	constructor(_ctx: unknown, _opts?: unknown) {
		super();
	}
	start(): void {}
	stop(): void {}
}

class FakeAudioContext {
	readonly destination = new FakeNode();
	readonly sampleRate = 48_000;
	readonly audioWorklet = { addModule: () => Promise.resolve() };
	get currentTime(): number {
		return clock;
	}
	resume(): Promise<void> {
		return Promise.resolve();
	}
	createBuffer(channels: number, length: number, rate: number) {
		const data = Array.from(
			{ length: channels },
			() => new Float32Array(length),
		);
		return {
			length,
			duration: length / rate,
			numberOfChannels: channels,
			sampleRate: rate,
			getChannelData: (c: number) => data[c]!,
		};
	}
	decodeAudioData(): Promise<unknown> {
		return new Promise(() => {});
	}
}

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};

const installFakeWebAudio = (): void => {
	const fakes: Record<string, unknown> = {
		AudioContext: FakeAudioContext,
		GainNode: FakeGain,
		StereoPannerNode: FakePanner,
		BiquadFilterNode: FakeFilter,
		AudioBufferSourceNode: FakeSource,
		window: {
			addEventListener: () => {},
			removeEventListener: () => {},
		},
	};
	for (const [key, value] of Object.entries(fakes)) {
		saved[key] = globals[key];
		globals[key] = value;
	}
};

const restoreWebAudio = (): void => {
	for (const key of Object.keys(saved)) {
		globals[key] = saved[key];
	}
};

// ---------------------------------------------------------------------------

describe("looping voices never schedule into the future", () => {
	beforeAll(installFakeWebAudio);
	afterAll(restoreWebAudio);
	beforeEach(() => {
		paramCalls = [];
		clock = 0;
	});

	test("sixty frames of pushes leave one event kind and nothing scheduled ahead", () => {
		const audio = new AudioManager();
		const buffer = audio.createBuffer(0.1);
		const voice = audio.playLoop(buffer, {
			filter: { type: "lowpass", frequency: 400 },
		});
		paramCalls = [];

		for (let frame = 0; frame < 60; frame++) {
			clock = frame / 60;
			voice.set({
				gain: 0.3 + frame * 0.001,
				pan: -0.2,
				frequency: 600 + frame,
				tau: 0.08,
			});
		}

		expect(paramCalls.length).toBe(180);
		const methods = new Set(paramCalls.map((c) => c.method));
		expect([...methods]).toEqual(["setTargetAtTime"]);
		expect(paramCalls.filter((c) => c.time > c.now)).toEqual([]);
	});

	test("a bus mute schedules its residual, and a bus is not a per-frame param", () => {
		const audio = new AudioManager();
		const bus = audio.createBus();
		paramCalls = [];
		bus.mute(true);

		const ahead = paramCalls.filter((c) => c.time > c.now);
		expect(ahead.length).toBe(1);
		expect(ahead[0]!.method).toBe("setValueAtTime");
	});
});

const loadRapierHeadless = (): Promise<void> =>
	loadRapier(async () => {
		const mod =
			(await import("@dimforge/rapier2d-compat")) as unknown as {
				init: () => Promise<void>;
			};
		await mod.init();
		return mod as never;
	});

describe("the bus tree", () => {
	beforeAll(loadRapierHeadless);

	const memoryStore = (): SettingsStore => {
		const values = new Map<string, string>();
		return {
			get: (key) => values.get(key) ?? null,
			set: (key, value) => void values.set(key, value),
		};
	};

	test("a world's sounds are gated by every bus above them", () => {
		const audio = new NullAudioManager();
		const viewBus = audio.createBus();
		const worldBus = audio.createBus(viewBus);
		const world = new World({ x: 0, y: -1 });
		world.attachAudio(audio, worldBus);
		const ambience = nullBus(world.audio.ambience);

		expect(ambience.effectiveGain()).toBe(1);

		viewBus.mute(true);
		expect(ambience.effectiveGain()).toBe(0);
		viewBus.mute(false);

		worldBus.mute(true);
		expect(ambience.effectiveGain()).toBe(0);
		worldBus.mute(false);

		audio.setMasterGain(0.5);
		audio.setCategoryGain("ambience", 0.5);
		expect(ambience.effectiveGain()).toBeCloseTo(0.25, 10);
		expect(nullBus(world.audio.sfx).effectiveGain()).toBeCloseTo(
			0.5,
			10,
		);
	});

	test("disposing a world takes its buses out of the tree", () => {
		const audio = new NullAudioManager();
		const viewBus = audio.createBus();
		const world = new World({ x: 0, y: -1 });
		world.attachAudio(audio, viewBus);
		const ambience = nullBus(world.audio.ambience);

		expect(nullBus(viewBus).children.length).toBe(1);
		world.dispose();
		expect(nullBus(viewBus).children.length).toBe(0);
		expect(ambience.disposed).toBe(true);
	});

	test("an unattached world hangs off nothing, so it reaches no output", () => {
		const world = new World({ x: 0, y: -1 });
		const ambience = nullBus(world.audio.ambience);
		expect(ambience.parent).not.toBe(null);
		expect(ambience.parent!.parent).toBe(null);
	});

	test("player volumes reach user gain and leave system gain alone", () => {
		const audio = new NullAudioManager();
		const world = new World({ x: 0, y: -1 });
		world.attachAudio(audio, audio.createBus());
		const settings = new PlayerSettings(memoryStore());
		const detach = applyVolumeSettings(audio, settings);

		settings.setVolume("ambience", 0.5);
		const ambience = nullBus(world.audio.ambience);
		expect(ambience.userGain).toBeCloseTo(volumeGain(0.5), 10);
		expect(ambience.systemGain).toBe(1);

		ambience.mute(true);
		expect(ambience.userGain).toBeCloseTo(volumeGain(0.5), 10);
		detach();
	});

	test("full volume is unity and half position is about -10 dB", () => {
		expect(volumeGain(1)).toBe(1);
		const decibels = 20 * Math.log10(volumeGain(0.5));
		expect(decibels).toBeCloseTo(-10, 0);
	});

	test("every category is reachable by name", () => {
		const audio = new NullAudioManager();
		const set = audio.createBusSet();
		for (const category of AUDIO_CATEGORIES) {
			audio.setCategoryGain(category, 0.25);
			expect(nullBus(set[category]).userGain).toBe(0.25);
		}
	});
});

describe("audio focus is derived", () => {
	const fakeRealm = (focused: boolean) => {
		const listeners = new Map<string, () => void>();
		const realm: FocusRealm = {
			addEventListener: (type, listener) =>
				void listeners.set(type, listener),
			removeEventListener: (type) => void listeners.delete(type),
			document: { hasFocus: () => focused },
		};
		return {
			realm,
			focus: () => listeners.get("focus")?.(),
			blur: () => listeners.get("blur")?.(),
		};
	};

	test("nothing sounds while paused, blurred, or showing no owner", () => {
		expect(
			audioOwnerOf({
				paused: true,
				realms: [{ focused: true, owner: "a" }],
			}),
		).toBe(null);
		expect(
			audioOwnerOf({
				paused: false,
				realms: [{ focused: false, owner: "a" }],
			}),
		).toBe(null);
		expect(
			audioOwnerOf({
				paused: false,
				realms: [{ focused: true, owner: null }],
			}),
		).toBe(null);
	});

	test("only the focused realm's owner sounds, one at a time", () => {
		const focus = new AudioFocus();
		const hub = fakeRealm(true);
		const satellite = fakeRealm(false);
		focus.registerRealm(hub.realm);
		focus.registerRealm(satellite.realm);
		focus.setRealmOwner(hub.realm, "view:a");
		focus.setRealmOwner(satellite.realm, "view:b");

		const hubBus = new NullAudioManager().createBus();
		const satelliteBus = new NullAudioManager().createBus();
		focus.gate(hubBus, "view:a");
		focus.gate(satelliteBus, "view:b");

		expect(nullBus(hubBus).systemGain).toBe(1);
		expect(nullBus(satelliteBus).systemGain).toBe(0);

		hub.blur();
		satellite.focus();
		expect(focus.owner).toBe("view:b");
		expect(nullBus(hubBus).systemGain).toBe(0);
		expect(nullBus(satelliteBus).systemGain).toBe(1);
	});

	test("pause mutes without anything having to release", () => {
		const focus = new AudioFocus();
		const realm = fakeRealm(true);
		focus.registerRealm(realm.realm);
		focus.setRealmOwner(realm.realm, "game");
		const bus = new NullAudioManager().createBus();
		focus.gate(bus, "game");

		expect(nullBus(bus).systemGain).toBe(1);
		focus.setPaused(true);
		expect(nullBus(bus).systemGain).toBe(0);
		focus.setPaused(false);
		expect(nullBus(bus).systemGain).toBe(1);
	});
});
