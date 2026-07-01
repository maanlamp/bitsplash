import {
	Compiler,
	CompilerOptions,
	JsonFileHandler,
	type Story,
} from "inkjs/full";
import type { InkStoryComponent } from "../ink/ink-story-component";

export const compileStory = (
	sources: Record<string, string>,
	main: string,
): Story => {
	const options = new CompilerOptions(
		main,
		[],
		true,
		null,
		new JsonFileHandler(sources),
	);
	return new Compiler(sources[main] ?? "", options).Compile();
};

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
