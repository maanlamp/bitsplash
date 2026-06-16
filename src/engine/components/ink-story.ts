import type { Story } from "inkjs/full";
import { serializable } from "../serialization/serializable";

@serializable("InkStory")
export class InkStoryComponent {
	story: Story | null = null;
	state = "";
}
