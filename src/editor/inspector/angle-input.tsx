import type Angle from "../../engine/angle";
import type { History } from "../history";
import { Adornment } from "./field";
import { NumberInput } from "./inputs";
import { commit } from "./inspector";

const DEG_PER_RAD = 180 / Math.PI;

const round = (n: number): number => Math.round(n * 100) / 100;

export const AngleInput = ({
	value,
	history,
}: Readonly<{ value: Angle; history: History }>) => (
	<NumberInput
		value={round(value.radians * DEG_PER_RAD)}
		step={1}
		largeStep={15}
		onCommit={(deg) =>
			commit(history, value, "radians", deg / DEG_PER_RAD)
		}
	>
		<Adornment>°</Adornment>
	</NumberInput>
);
