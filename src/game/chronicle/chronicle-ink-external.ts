import type { Story } from "inkjs";
import type { ReadonlyECS } from "../../engine/ecs";
import { ChronicleComponent } from "./chronicle-component";

export const bindSetChronicle = (
	story: Story,
	ecs: ReadonlyECS,
): void => {
	story.BindExternalFunction(
		"set_chronicle",
		(key: string, value: string) => {
			ecs.queryFirst(ChronicleComponent)?.[1].set(key, value);
		},
		false,
	);
};
