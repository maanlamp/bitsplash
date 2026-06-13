import type { History } from "./history";

type ValueRendererProps<T> = {
	value: T;
	history: History;
	component: object;
	fieldKey: string;
};

type ValueRenderer<T> = (
	props: ValueRendererProps<T>,
) => React.ReactNode;

const renderers = new Map<Function, ValueRenderer<unknown>>();

export const registerValueRenderer = <T extends object>(
	ctor: new (...args: never[]) => T,
	renderer: ValueRenderer<T>,
): void => {
	renderers.set(ctor, renderer as ValueRenderer<unknown>);
};

export const getValueRenderer = (
	value: object,
): ValueRenderer<unknown> | undefined =>
	renderers.get(value.constructor as Function);
