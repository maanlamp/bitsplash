export type SerializedComponent = Record<string, unknown>;

export type SerializedEntity = Readonly<{
	id: string;
	components: Record<string, SerializedComponent>;
}>;

export type SerializedWorld = ReadonlyArray<SerializedEntity>;

export type ComponentClass = new (...args: any[]) => object;

const byName = new Map<string, ComponentClass>();
const byCtor = new Map<ComponentClass, string>();

export const registerComponent = (
	typeName: string,
	ctor: ComponentClass,
): void => {
	byName.set(typeName, ctor);
	byCtor.set(ctor, typeName);
};

export const componentTypeName = (
	component: object,
): string | undefined =>
	byCtor.get(component.constructor as ComponentClass);

export const componentClass = (
	typeName: string,
): ComponentClass | undefined => byName.get(typeName);

export const registeredComponents = (): ReadonlyArray<
	readonly [string, ComponentClass]
> => [...byName.entries()];
