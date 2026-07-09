import Angle from "../../engine/angle";
import { Color } from "../../engine/color";
import { Duration } from "../../engine/duration";
import { Percent } from "../../engine/percent";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { FontSettings } from "../../engine/text/font-settings";
import normalHitFont from "../content/assets/comicoro.font.zip?url";
import critHitFont from "../content/assets/doublehomicide.font.zip?url";

@serializable("HitsplatStyle")
export class HitsplatStyleComponent {
	@serialize() font: FontSettings;
	@serialize() critFont: FontSettings;
	@serialize({ group: "fill" }) color: Color;
	@serialize({ group: "fill" }) outlineColor: Color;
	@serialize({ group: "critColors" }) critColor: Color;
	@serialize({ group: "critColors" }) incomingColor: Color;
	@serialize() launchSpeedMin: number;
	@serialize() launchSpeedMax: number;
	@serialize() launchAngleMin: Angle;
	@serialize() launchAngleMax: Angle;
	@serialize() gravity: number;
	@serialize({ group: "lifetime" }) lifetime: Duration;
	@serialize({ group: "lifetime" }) critLifetimeBonus: Duration;
	@serialize() fadePortion: Percent;
	@serialize({ group: "pop" }) popScale: number;
	@serialize({ group: "pop" }) popDuration: Duration;
	@serialize() flavourTilt: Angle;
	@serialize({ group: "trauma" }) traumaPerHp: number;
	@serialize({ group: "trauma" }) critTraumaBonus: number;
	@serialize() blockedText: string;

	constructor(
		font: FontSettings = new FontSettings(normalHitFont, 16),
		critFont: FontSettings = new FontSettings(critHitFont, 20),
		color: string = "#ffe066",
		outlineColor: string = "#1a1a1a",
		critColor: string = "#ff5252",
		incomingColor: string = "#ff3b3b",
		launchSpeedMin: number = 90,
		launchSpeedMax: number = 160,
		launchAngleMin: number = 1,
		launchAngleMax: number = 1.4,
		gravity: number = 500,
		lifetime: number = 0.5,
		critLifetimeBonus: number = 0.5,
		fadePortion: number = 0.4,
		popScale: number = 1.6,
		popDuration: number = 0.15,
		flavourTilt: number = 0.2,
		traumaPerHp: number = 0.015,
		critTraumaBonus: number = 0.15,
		blockedText: string = "BLOCKED",
	) {
		this.font = font;
		this.critFont = critFont;
		this.color = new Color(color);
		this.outlineColor = new Color(outlineColor);
		this.critColor = new Color(critColor);
		this.incomingColor = new Color(incomingColor);
		this.launchSpeedMin = launchSpeedMin;
		this.launchSpeedMax = launchSpeedMax;
		this.launchAngleMin = new Angle(launchAngleMin);
		this.launchAngleMax = new Angle(launchAngleMax);
		this.gravity = gravity;
		this.lifetime = new Duration(lifetime);
		this.critLifetimeBonus = new Duration(critLifetimeBonus);
		this.fadePortion = new Percent(fadePortion);
		this.popScale = popScale;
		this.popDuration = new Duration(popDuration);
		this.flavourTilt = new Angle(flavourTilt);
		this.traumaPerHp = traumaPerHp;
		this.critTraumaBonus = critTraumaBonus;
		this.blockedText = blockedText;
	}
}
