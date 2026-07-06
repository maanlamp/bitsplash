export const VALUE_TYPE = Symbol("ValueType");

export type ValueType = { readonly [VALUE_TYPE]: true };

export type SerializableValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| ValueType
	| readonly SerializableValue[]
	| { readonly [key: string]: SerializableValue };

export type SelectOption =
	| string
	| Readonly<{ label: string; value: string | number }>;

export type SerializeOptions = Readonly<{
	required?: boolean;
	options?: readonly SelectOption[];
	group?: string;
}>;
