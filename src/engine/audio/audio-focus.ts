import type { AudioBus } from "./audio-bus";

/**
 * Who may sound right now — **derived, never claimed**.
 *
 * Every audible surface (the game, each editor scene view) registers an owner id
 * with the realm it lives in. This module computes which single owner the user is
 * actually attending to, from three facts and nothing else:
 *
 * - which realm has OS focus (listeners are installed **per realm**, so a
 *   satellite editor window or a popout gates on its own blur rather than the
 *   hub's);
 * - which owner that realm reports as its focused one;
 * - whether the host is paused.
 *
 * Nothing calls "claim" or "release". That matters because a bus is muted by
 * absence: there is no dead-man's switch anywhere in the graph, so a missed
 * release would sustain ambience forever. Deriving the owner removes the class
 * of bug instead of its instances.
 *
 * Blur mutes; it does not pause. A blurred game keeps simulating.
 */

/** Identifies an audible surface. Editor views use their view id. */
export type AudioOwnerId = string;

/**
 * The owner id the bundled game registers under. A run world hosted by the
 * editor registers under its **view id** instead, so two views running at once
 * still gate independently.
 */
export const GAME_AUDIO_OWNER: AudioOwnerId = "game";

/**
 * The part of a `Window` audio focus needs. Narrow on purpose: a real `Window`
 * satisfies it, and so does a fake one in a test.
 */
export type FocusRealm = Readonly<{
	addEventListener: (
		type: "focus" | "blur",
		listener: () => void,
	) => void;
	removeEventListener: (
		type: "focus" | "blur",
		listener: () => void,
	) => void;
	document: Readonly<{ hasFocus: () => boolean }>;
}>;

/** One realm's contribution to the derivation. */
export type RealmFocus = Readonly<{
	focused: boolean;
	owner: AudioOwnerId | null;
}>;

/** Everything the owner is derived from, in the order realms were registered. */
export type AudioFocusInput = Readonly<{
	realms: ReadonlyArray<RealmFocus>;
	paused: boolean;
}>;

/**
 * The single owner allowed to sound, or `null` for silence.
 *
 * Pure, so the rule is assertable without a `Window`: pause silences everything,
 * an unfocused app silences everything, and a focused realm reporting no owner
 * (its focused view is a sprite editor, say) silences everything too.
 *
 * @example
 * audioOwnerOf({ paused: false, realms: [{ focused: true, owner: "scene:demo" }] });
 * // "scene:demo"
 */
export const audioOwnerOf = (
	input: AudioFocusInput,
): AudioOwnerId | null => {
	if (input.paused) {
		return null;
	}
	for (const realm of input.realms) {
		if (realm.focused) {
			return realm.owner;
		}
	}
	return null;
};

type RegisteredRealm = {
	focused: boolean;
	owner: AudioOwnerId | null;
	detach: () => void;
};

export class AudioFocus {
	private readonly realms = new Map<FocusRealm, RegisteredRealm>();
	private readonly listeners = new Set<
		(owner: AudioOwnerId | null) => void
	>();
	private pausedValue = false;
	private current: AudioOwnerId | null = null;

	/** The owner allowed to sound right now. */
	get owner(): AudioOwnerId | null {
		return this.current;
	}

	/**
	 * Start following `realm`'s OS focus. Returns an unregister.
	 *
	 * @example
	 * useEffect(() => audioFocus.registerRealm(satelliteWindow), []);
	 */
	registerRealm(realm: FocusRealm): () => void {
		const existing = this.realms.get(realm);
		if (existing) {
			return () => this.unregisterRealm(realm);
		}
		const onFocus = (): void => this.setRealmFocused(realm, true);
		const onBlur = (): void => this.setRealmFocused(realm, false);
		realm.addEventListener("focus", onFocus);
		realm.addEventListener("blur", onBlur);
		this.realms.set(realm, {
			focused: realm.document.hasFocus(),
			owner: null,
			detach: () => {
				realm.removeEventListener("focus", onFocus);
				realm.removeEventListener("blur", onBlur);
			},
		});
		this.derive();
		return () => this.unregisterRealm(realm);
	}

	unregisterRealm(realm: FocusRealm): void {
		const entry = this.realms.get(realm);
		if (!entry) {
			return;
		}
		entry.detach();
		this.realms.delete(realm);
		this.derive();
	}

	/**
	 * Declare which owner `realm` is currently showing. Idempotent, so a host may
	 * call it every frame.
	 */
	setRealmOwner(realm: FocusRealm, owner: AudioOwnerId | null): void {
		const entry = this.realms.get(realm);
		if (!entry || entry.owner === owner) {
			return;
		}
		entry.owner = owner;
		this.derive();
	}

	/** Whether the host is paused. A paused host owns nothing. */
	setPaused(paused: boolean): void {
		if (this.pausedValue === paused) {
			return;
		}
		this.pausedValue = paused;
		this.derive();
	}

	/** Subscribe to owner changes. Fires only on a change. Returns an unsubscribe. */
	subscribe(
		listener: (owner: AudioOwnerId | null) => void,
	): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Hold `bus` muted whenever `owner` is not the one attending. Applies
	 * immediately and returns an unsubscribe.
	 *
	 * The bus is the only thing gated — no source consults focus, which is what
	 * keeps a future sound from having to remember to.
	 *
	 * @example
	 * this.detachGate = audioFocus.gate(this.viewBus, this.id);
	 */
	gate(bus: AudioBus, owner: AudioOwnerId): () => void {
		const apply = (): void => bus.mute(this.current !== owner);
		apply();
		return this.subscribe(apply);
	}

	private setRealmFocused(realm: FocusRealm, focused: boolean): void {
		const entry = this.realms.get(realm);
		if (!entry || entry.focused === focused) {
			return;
		}
		entry.focused = focused;
		this.derive();
	}

	private derive(): void {
		const next = audioOwnerOf({
			paused: this.pausedValue,
			realms: [...this.realms.values()],
		});
		if (next === this.current) {
			return;
		}
		this.current = next;
		for (const listener of this.listeners) {
			listener(next);
		}
	}
}

/** The process's audio focus. Hosts register their realms with it. */
export const audioFocus = new AudioFocus();
