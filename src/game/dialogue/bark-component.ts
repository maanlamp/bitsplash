import { Duration } from "../../engine/duration";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { FontSettings } from "../../engine/text/font-settings";
import fsPixelSansUrl from "../content/assets/fs-pixel-sans-unicode.font.zip?url";

@serializable("Bark")
export class BarkComponent {
	@serialize() text: string;
	@serialize() ttl: Duration;
	@serialize() elapsed: Duration = Duration.zero();
	@serialize() offset: number;
	@serialize() font: FontSettings;

	constructor(
		text = "",
		ttl: Duration = new Duration(3),
		offset = 4,
		font: FontSettings = new FontSettings(fsPixelSansUrl),
	) {
		this.text = text;
		this.ttl = ttl;
		this.offset = offset;
		this.font = font;
	}
}
