import type { Story } from "inkjs/full";
import {
	serializable,
	serialize,
} from "../serialization/serializable";

@serializable("InkStory")
export class InkStoryComponent {
	story: Story | null = null;
	@serialize() state = "";
}
