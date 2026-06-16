const enums = new Map<string, ReadonlyArray<string>>();

type FieldEnumMetadata = {
	fieldEnums?: Record<string, ReadonlyArray<string>>;
};

export const options =
	(values: ReadonlyArray<string>) =>
	(_value: undefined, context: ClassFieldDecoratorContext): void => {
		const meta = context.metadata as FieldEnumMetadata;
		(meta.fieldEnums ??= {})[String(context.name)] = values;
	};

const filePickers = new Map<string, string>();

type FieldFileMetadata = {
	fileFields?: Record<string, string>;
};

export const file =
	(accept?: string) =>
	(_value: undefined, context: ClassFieldDecoratorContext): void => {
		const meta = context.metadata as FieldFileMetadata;
		(meta.fileFields ??= {})[String(context.name)] = accept ?? "";
	};

export const collectFileFields = (
	typeName: string,
	metadata: DecoratorMetadata,
): void => {
	const meta = metadata as FieldFileMetadata;
	if (!meta.fileFields) {
		return;
	}
	for (const [field, accept] of Object.entries(meta.fileFields)) {
		filePickers.set(`${typeName}.${field}`, accept);
	}
};

export const isFileField = (
	typeName: string,
	field: string,
): string | undefined => filePickers.get(`${typeName}.${field}`);

export const collectFieldEnums = (
	typeName: string,
	metadata: DecoratorMetadata,
): void => {
	const meta = metadata as FieldEnumMetadata;
	if (!meta.fieldEnums) {
		return;
	}
	for (const [field, values] of Object.entries(meta.fieldEnums)) {
		enums.set(`${typeName}.${field}`, values);
	}
};

export const fieldEnum = (
	typeName: string,
	field: string,
): ReadonlyArray<string> | undefined =>
	enums.get(`${typeName}.${field}`);

const multilineFields = new Set<string>();

type FieldMultilineMetadata = {
	multilineFields?: Record<string, true>;
};

export const multiline =
	() =>
	(_value: undefined, context: ClassFieldDecoratorContext): void => {
		const meta = context.metadata as FieldMultilineMetadata;
		(meta.multilineFields ??= {})[String(context.name)] = true;
	};

export const collectMultilineFields = (
	typeName: string,
	metadata: DecoratorMetadata,
): void => {
	const meta = metadata as FieldMultilineMetadata;
	if (!meta.multilineFields) {
		return;
	}
	for (const field of Object.keys(meta.multilineFields)) {
		multilineFields.add(`${typeName}.${field}`);
	}
};

export const isMultilineField = (
	typeName: string,
	field: string,
): boolean => multilineFields.has(`${typeName}.${field}`);

const requiredFields = new Set<string>();

type FieldRequiredMetadata = {
	requiredFields?: Record<string, true>;
};

export const required =
	() =>
	(_value: undefined, context: ClassFieldDecoratorContext): void => {
		const meta = context.metadata as FieldRequiredMetadata;
		(meta.requiredFields ??= {})[String(context.name)] = true;
	};

export const collectRequiredFields = (
	typeName: string,
	metadata: DecoratorMetadata,
): void => {
	const meta = metadata as FieldRequiredMetadata;
	if (!meta.requiredFields) {
		return;
	}
	for (const field of Object.keys(meta.requiredFields)) {
		requiredFields.add(`${typeName}.${field}`);
	}
};

export const isRequiredField = (
	typeName: string,
	field: string,
): boolean => requiredFields.has(`${typeName}.${field}`);

const skipFields = new Set<string>();

type FieldSkipMetadata = {
	skipFields?: Record<string, true>;
};

export const skip =
	() =>
	(_value: undefined, context: ClassFieldDecoratorContext): void => {
		const meta = context.metadata as FieldSkipMetadata;
		(meta.skipFields ??= {})[String(context.name)] = true;
	};

export const collectSkipFields = (
	typeName: string,
	metadata: DecoratorMetadata,
): void => {
	const meta = metadata as FieldSkipMetadata;
	if (!meta.skipFields) {
		return;
	}
	for (const field of Object.keys(meta.skipFields)) {
		skipFields.add(`${typeName}.${field}`);
	}
};

export const isSkipField = (
	typeName: string,
	field: string,
): boolean => skipFields.has(`${typeName}.${field}`);
