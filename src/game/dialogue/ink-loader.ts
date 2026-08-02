import { Story } from "inkjs";
import { STORY_JSON } from "../content/dialogue/story.gen";

/**
 * Build the shipped ink story from the build-time compiled JSON.
 *
 * The `.ink` sources are compiled once by `bun run gen`; the runtime only
 * deserializes. Compiling here instead cost ~50 ms on whichever gameplay frame
 * first spoke a line, and dragged the ink compiler into the bundle.
 */
export const createStory = (): Story => new Story(STORY_JSON);
