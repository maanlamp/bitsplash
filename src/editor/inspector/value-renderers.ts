import type { FieldBinding } from "../commands";

type ValueRendererProps<T> = {
	value: T;
	binding: FieldBinding;
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
	renderers.get(value.constructor);
