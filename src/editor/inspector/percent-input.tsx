import type { Percent } from "../../engine/percent";
import type { FieldBinding } from "../commands";
import { Adornment } from "./field";
import { NumberInput } from "./inputs";

const round = (n: number): number => Math.round(n * 100) / 100;

export const PercentInput = ({
	value,
	binding,
}: Readonly<{ value: Percent; binding: FieldBinding }>) => (
	<NumberInput
		value={round(value.value * 100)}
		step={1}
		min={0}
		max={100}
		onCommit={(n) => binding.commit(["value"], n / 100)}
	>
		<Adornment>%</Adornment>
	</NumberInput>
);
