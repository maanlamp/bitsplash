import { FadeTimeline } from "../../engine/animation/fade-timeline";
import type { Seconds } from "../../engine/duration";
import { FontSettings } from "../../engine/font-settings";
import fsPixelSansUrl from "../content/assets/fs-pixel-sans-unicode.font.zip?url";

export class QuestNoticeComponent {
	text: string;
	fade: FadeTimeline;
	font: FontSettings;

	constructor(
		text: string,
		fade = new FadeTimeline(
			0.4 as Seconds,
			1.2 as Seconds,
			0.6 as Seconds,
		),
		font = new FontSettings(fsPixelSansUrl, 18),
	) {
		this.text = text;
		this.fade = fade;
		this.font = font;
	}
}
