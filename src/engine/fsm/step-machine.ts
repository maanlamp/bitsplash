import type { Seconds } from "../duration";
import type { CompiledMachine, StepResult } from "./machine";
import type { MachineState } from "./machine-state";

export const stepMachine = <S extends string, P>(
	machine: CompiledMachine<S, P>,
	state: MachineState,
	ctx: P,
	dt: Seconds,
): StepResult<S> => {
	const result = machine.step(
		{
			current: state.current as S,
			elapsed: state.elapsed as Seconds,
		},
		ctx,
		dt,
	);
	state.current = result.next.current;
	state.elapsed = result.next.elapsed;
	return result;
};
