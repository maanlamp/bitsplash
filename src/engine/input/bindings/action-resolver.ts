import type {
	ActionCatalog,
	ActionKind,
	Activation,
	Binding,
} from "./action-catalog";
import type { ActionsApi } from "./actions-api";
import type { DeviceSnapshot } from "../device-snapshot";
import type { SettingsStore } from "../settings-store";
import type {
	ExpandedBinding,
	Expansion,
	TerminalSource,
} from "./ref-expansion";
import { RefExpansion, sourceKey } from "./ref-expansion";
import { EdgeDetector } from "../edge-detector";

export const SETTINGS_KEYS = {
	holdThresholdMs: "input.holdThresholdMs",
	doubleTapWindowMs: "input.doubleTapWindowMs",
	allHoldsToToggle: "input.allHoldsToToggle",
	togglePrefix: "input.toggle.",
} as const;

export const SETTINGS_DEFAULTS = {
	holdThresholdMs: 400,
	doubleTapWindowMs: 250,
} as const;

type Thresholds = Readonly<{
	holdThresholdMs: number;
	doubleTapWindowMs: number;
	allHoldsToToggle: boolean;
}>;

type SignalState = {
	down: boolean;
	pressStart: number;
	holdFired: boolean;
	lastPressAt: number;
};

type SignalFrame = Readonly<{
	down: boolean;
	pressed: boolean;
	released: boolean;
	holdCrossed: boolean;
	doubleTapped: boolean;
}>;

export class ActionResolver implements ActionsApi {
	private readonly edges = new EdgeDetector();
	private readonly expander = new RefExpansion();
	private readonly kinds = new Map<string, ActionKind>();
	private readonly signals = new Map<string, SignalState>();
	private readonly frames = new Map<string, SignalFrame>();
	private readonly latches = new Map<string, boolean>();
	private consumed = new Set<string>();
	private currentBindings: readonly Binding[];
	private activeContexts: string[];
	private clock = 0;
	private dropEdges = false;
	private expansion: Expansion;

	constructor(
		catalog: ActionCatalog,
		private readonly settings: SettingsStore,
		bindings?: readonly Binding[],
	) {
		for (const action of catalog.actions) {
			this.kinds.set(action.id, action.kind);
		}
		this.activeContexts = [...catalog.contexts];
		this.currentBindings = bindings ?? catalog.defaults;
		this.expander.setBindings(this.currentBindings);
		this.expansion = this.expander.expansion;
	}

	get bindings(): readonly Binding[] {
		return this.currentBindings;
	}

	get contexts(): readonly string[] {
		return this.activeContexts;
	}

	setActiveContexts(ids: readonly string[]): void {
		this.activeContexts = [...ids];
	}

	setBindings(bindings: readonly Binding[]): void {
		this.currentBindings = bindings;
		this.expander.setBindings(bindings);
		this.expansion = this.expander.expansion;
		this.latches.clear();
	}

	addBinding(binding: Binding): void {
		this.setBindings([...this.currentBindings, binding]);
	}

	removeBindingAt(index: number): void {
		this.setBindings(
			this.currentBindings.filter((_, i) => i !== index),
		);
	}

	getExpansion(): Expansion {
		return this.expansion;
	}

	resetEdges(): void {
		this.edges.reset();
		this.signals.clear();
		this.frames.clear();
		this.dropEdges = true;
	}

	step(snapshot: DeviceSnapshot, dtMs: number): void {
		this.edges.step(snapshot);
		this.clock += dtMs;
		this.consumed = new Set<string>();
		this.expansion = this.expander.expansion;

		const thresholds = this.readThresholds();
		const drop = this.dropEdges;
		this.dropEdges = false;
		this.frames.clear();

		const seen = new Set<string>();
		for (const e of this.expansion.bindings) {
			const key = sourceKey(e.source);
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			this.frames.set(
				key,
				this.stepSignal(key, e.source, thresholds, drop),
			);
		}

		this.applyToggles(thresholds);
	}

	fired(id: string): boolean {
		return this.firedCount(id) > 0;
	}

	firedCount(id: string): number {
		if (this.kinds.get(id) !== "discrete") {
			return 0;
		}
		let count = 0;
		for (const e of this.expansion.byAction.get(id) ?? []) {
			if (this.sourceConsumed(e.source)) {
				continue;
			}
			const frame = this.frames.get(sourceKey(e.source));
			if (!frame) {
				continue;
			}
			count += discreteCount(this.effectiveActivation(e), frame);
		}
		return count;
	}

	active(id: string): boolean {
		if (this.kinds.get(id) !== "continuous") {
			return false;
		}
		if (this.latches.get(id) === true) {
			return true;
		}
		for (const e of this.expansion.byAction.get(id) ?? []) {
			if (this.effectiveActivation(e) !== "whileHeld") {
				continue;
			}
			if (this.sourceConsumed(e.source)) {
				continue;
			}
			const frame = this.frames.get(sourceKey(e.source));
			if (frame?.down) {
				return true;
			}
		}
		return false;
	}

	consume(id: string): void {
		for (const e of this.expansion.byAction.get(id) ?? []) {
			for (const t of e.source.tokens) {
				this.consumed.add(t);
			}
		}
	}

	private sourceConsumed(source: TerminalSource): boolean {
		for (const t of source.tokens) {
			if (this.consumed.has(t)) {
				return true;
			}
		}
		return false;
	}

	private signalDown(source: TerminalSource): boolean {
		if (source.kind === "chord") {
			return source.tokens.every((t) => this.edges.isDown(t));
		}
		return source.tokens.some((t) => this.edges.isDown(t));
	}

	private stepSignal(
		key: string,
		source: TerminalSource,
		thresholds: Thresholds,
		drop: boolean,
	): SignalFrame {
		let state = this.signals.get(key);
		if (!state) {
			state = {
				down: false,
				pressStart: 0,
				holdFired: false,
				lastPressAt: -1,
			};
			this.signals.set(key, state);
		}

		const down = this.signalDown(source);
		if (drop) {
			state.down = down;
			state.holdFired = false;
			state.pressStart = this.clock;
			state.lastPressAt = -1;
			return {
				down,
				pressed: false,
				released: false,
				holdCrossed: false,
				doubleTapped: false,
			};
		}
		const pressed = down && !state.down;
		const released = !down && state.down;

		let doubleTapped = false;

		if (pressed) {
			state.pressStart = this.clock;
			state.holdFired = false;
			if (
				state.lastPressAt >= 0 &&
				this.clock - state.lastPressAt <= thresholds.doubleTapWindowMs
			) {
				doubleTapped = true;
				state.lastPressAt = -1;
			} else {
				state.lastPressAt = this.clock;
			}
		}

		let holdCrossed = false;
		if (
			down &&
			!state.holdFired &&
			this.clock - state.pressStart >= thresholds.holdThresholdMs
		) {
			holdCrossed = true;
			state.holdFired = true;
		}
		if (released) {
			state.holdFired = false;
		}

		state.down = down;

		return {
			down,
			pressed,
			released,
			holdCrossed,
			doubleTapped,
		};
	}

	private applyToggles(thresholds: Thresholds): void {
		const flip = new Set<string>();
		for (const e of this.expansion.bindings) {
			if (this.effectiveActivation(e, thresholds) !== "toggle") {
				continue;
			}
			const frame = this.frames.get(sourceKey(e.source));
			if (frame?.pressed && !this.sourceConsumed(e.source)) {
				flip.add(e.action);
			}
		}
		for (const id of flip) {
			this.latches.set(id, !(this.latches.get(id) ?? false));
		}
	}

	private effectiveActivation(
		e: ExpandedBinding,
		thresholds?: Thresholds,
	): Activation {
		const kind = this.kinds.get(e.action);
		if (kind === "discrete") {
			if (
				e.activation === "press" ||
				e.activation === "hold" ||
				e.activation === "doubleTap"
			) {
				return e.activation;
			}
			return "press";
		}
		const override = this.settings.get(
			`${SETTINGS_KEYS.togglePrefix}${e.action}`,
		);
		if (override === "toggle" || override === "whileHeld") {
			return override;
		}
		let base: Activation;
		if (e.activation === "toggle" || e.activation === "whileHeld") {
			base = e.activation;
		} else if (
			e.activation === "press" ||
			e.activation === "doubleTap"
		) {
			base = "toggle";
		} else {
			base = "whileHeld";
		}
		const allToggle = thresholds
			? thresholds.allHoldsToToggle
			: this.settings.get(SETTINGS_KEYS.allHoldsToToggle) === "true";
		if (allToggle && base === "whileHeld") {
			return "toggle";
		}
		return base;
	}

	private readThresholds(): Thresholds {
		return {
			holdThresholdMs: this.readNumber(
				SETTINGS_KEYS.holdThresholdMs,
				SETTINGS_DEFAULTS.holdThresholdMs,
			),
			doubleTapWindowMs: this.readNumber(
				SETTINGS_KEYS.doubleTapWindowMs,
				SETTINGS_DEFAULTS.doubleTapWindowMs,
			),
			allHoldsToToggle:
				this.settings.get(SETTINGS_KEYS.allHoldsToToggle) === "true",
		};
	}

	private readNumber(key: string, fallback: number): number {
		const raw = this.settings.get(key);
		if (raw === null) {
			return fallback;
		}
		const value = Number(raw);
		return Number.isFinite(value) ? value : fallback;
	}
}

const discreteCount = (
	activation: Activation,
	frame: SignalFrame,
): number => {
	switch (activation) {
		case "press":
			return frame.pressed ? 1 : 0;
		case "hold":
			return frame.holdCrossed ? 1 : 0;
		case "doubleTap":
			return frame.doubleTapped ? 1 : 0;
		default:
			return 0;
	}
};
