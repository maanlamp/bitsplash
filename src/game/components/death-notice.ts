import { FadeTimeline } from "../../engine/animation/fade-timeline";
import type { Seconds } from "../../engine/duration";
import { FontSettings } from "../../engine/font-settings";
import fsPixelSansUrl from "../assets/fs-pixel-sans-unicode.font.zip?url";

export class DeathNoticeComponent {
	fade: FadeTimeline;
	font: FontSettings;

	constructor(
		fade = new FadeTimeline(
			0.3 as Seconds,
			1.5 as Seconds,
			0.7 as Seconds,
		),
		font = new FontSettings(fsPixelSansUrl, 24),
	) {
		this.fade = fade;
		this.font = font;
	}
}
