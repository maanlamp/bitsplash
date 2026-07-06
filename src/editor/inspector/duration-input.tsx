import type { Duration } from "../../engine/duration";
import type { History } from "../history";
import { Adornment } from "./field";
import { NumberInput } from "./inputs";
import { commit } from "./inspector";

export const DurationInput = ({
	value,
	history,
}: Readonly<{ value: Duration; history: History }>) => (
	<NumberInput
		value={value.seconds}
		step={0.05}
		min={0}
		onCommit={(n) => commit(history, value, "seconds", n)}
	>
		<Adornment>s</Adornment>
	</NumberInput>
);
