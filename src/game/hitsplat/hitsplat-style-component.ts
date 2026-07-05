import type { Seconds } from "../../engine/duration";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { FontSettings } from "../../engine/text/font-settings";
import doubleHomicideUrl from "../content/assets/doublehomicide.font.zip?url";
import kapelUrl from "../content/assets/kapel.font.zip?url";

@serializable("HitsplatStyle")
export class HitsplatStyleComponent {
	@serialize() font: FontSettings;
	@serialize() critFont: FontSettings;
	@serialize({ color: true }) color: string;
	@serialize({ color: true }) outlineColor: string;
	@serialize({ color: true }) critColor: string;
	@serialize({ color: true }) incomingColor: string;
	@serialize() launchSpeedMin: number;
	@serialize() launchSpeedMax: number;
	@serialize() launchAngleMin: number;
	@serialize() launchAngleMax: number;
	@serialize() gravity: number;
	@serialize() lifetime: Seconds;
	@serialize() critLifetimeBonus: Seconds;
	@serialize() fadePortion: number;
	@serialize() popScale: number;
	@serialize() popDuration: Seconds;
	@serialize() flavourTilt: number;
	@serialize() traumaPerHp: number;
	@serialize() critTraumaBonus: number;
	@serialize() blockedText: string;

	constructor(
		font: FontSettings = new FontSettings(kapelUrl, 16),
		critFont: FontSettings = new FontSettings(doubleHomicideUrl, 20),
		color: string = "#ffe066",
		outlineColor: string = "#1a1a1a",
		critColor: string = "#ff5252",
		incomingColor: string = "#ff3b3b",
		launchSpeedMin: number = 90,
		launchSpeedMax: number = 160,
		launchAngleMin: number = 1,
		launchAngleMax: number = 1.4,
		gravity: number = 500,
		lifetime: Seconds = 0.5 as Seconds,
		critLifetimeBonus: Seconds = 0.5 as Seconds,
		fadePortion: number = 0.4,
		popScale: number = 1.6,
		popDuration: Seconds = 0.15 as Seconds,
		flavourTilt: number = 0.2,
		traumaPerHp: number = 0.015,
		critTraumaBonus: number = 0.15,
		blockedText: string = "BLOCKED",
	) {
		this.font = font;
		this.critFont = critFont;
		this.color = color;
		this.outlineColor = outlineColor;
		this.critColor = critColor;
		this.incomingColor = incomingColor;
		this.launchSpeedMin = launchSpeedMin;
		this.launchSpeedMax = launchSpeedMax;
		this.launchAngleMin = launchAngleMin;
		this.launchAngleMax = launchAngleMax;
		this.gravity = gravity;
		this.lifetime = lifetime;
		this.critLifetimeBonus = critLifetimeBonus;
		this.fadePortion = fadePortion;
		this.popScale = popScale;
		this.popDuration = popDuration;
		this.flavourTilt = flavourTilt;
		this.traumaPerHp = traumaPerHp;
		this.critTraumaBonus = critTraumaBonus;
		this.blockedText = blockedText;
	}
}
