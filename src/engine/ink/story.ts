import type { Story } from "inkjs";
import type { InkStoryComponent } from "../ink/ink-story-component";

export const ensureStory = (
	component: InkStoryComponent,
	createStory: () => Story,
	bindExternals: (story: Story) => void,
): Story => {
	if (!component.story) {
		const story = createStory();
		if (component.state) {
			story.state.LoadJson(component.state);
		}
		bindExternals(story);
		component.story = story;
	}
	return component.story;
};

export const mirrorInkState = (
	component: InkStoryComponent,
): void => {
	if (component.story) {
		component.state = component.story.state.ToJson();
	}
};
