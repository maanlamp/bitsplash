import type { Percent } from "../../engine/percent";
import type { History } from "../history";
import { Adornment } from "./field";
import { NumberInput } from "./inputs";
import { commit } from "./inspector";

const round = (n: number): number => Math.round(n * 100) / 100;

export const PercentInput = ({
	value,
	history,
}: Readonly<{ value: Percent; history: History }>) => (
	<NumberInput
		value={round(value.value * 100)}
		step={1}
		min={0}
		max={100}
		onCommit={(n) => commit(history, value, "value", n / 100)}
	>
		<Adornment>%</Adornment>
	</NumberInput>
);
