import { useEffect, useReducer } from "react";
import { AssetRef } from "../../engine/asset-ref";
import type { ECS, EntityId } from "../../engine/ecs";
import {
	fieldOptions,
	serializableType,
	serializableTypeName,
} from "../../engine/serialization/registry";
import type { Scene } from "../../engine/scene/scene";
import {
	configFieldBinding,
	entityFieldBinding,
	type FieldBinding,
} from "../commands";
import { componentLabel } from "../component-label";
import type { EditorState } from "../editor-state";
import { toSentenceCase } from "../text-case";
import { useEditorValue } from "../use-editor";
import { Field } from "./field";
import { buildRows, type Row } from "./grouping";
import { InspectorEcsProvider } from "./inspector-ecs-context";
import styles from "./inspector.module.scss";
import {
	Checkbox,
	EnumSelect,
	NumberInput,
	TextInput,
} from "./inputs";
import { getValueRenderer } from "./value-renderers";
import type { SceneDocument } from "../scene-document";

const isEmptyValue = (value: unknown): boolean =>
	value === "" ||
	value === null ||
	value === undefined ||
	(value instanceof AssetRef && value.path === "");

const isValueObject = (value: unknown): value is object =>
	value !== null &&
	typeof value === "object" &&
	!Array.isArray(value);

const missingRequired = (value: object): boolean => {
	const typeName = serializableTypeName(value);
	for (const [key, field] of Object.entries(value)) {
		if (
			typeName &&
			fieldOptions(typeName, key)?.required &&
			isEmptyValue(field)
		) {
			return true;
		}
		if (
			isValueObject(field) &&
			serializableTypeName(field) &&
			missingRequired(field)
		) {
			return true;
		}
	}
	return false;
};

export const FieldControl = ({
	component,
	fieldKey,
	value,
	binding,
}: Readonly<{
	component: object;
	fieldKey: string;
	value: unknown;
	binding: FieldBinding;
}>) => {
	if (isValueObject(value)) {
		const renderer = getValueRenderer(value);
		if (renderer) {
			return (
				<>{renderer({ value, binding: binding.sub([fieldKey]) })}</>
			);
		}
	}

	const typeName = serializableTypeName(component);
	const options = typeName
		? fieldOptions(typeName, fieldKey)
		: undefined;

	if (options?.options) {
		return (
			<EnumSelect
				value={value as string | number}
				options={options.options}
				onCommit={(v) => binding.commit([fieldKey], v)}
			/>
		);
	}

	if (typeof value === "number") {
		return (
			<NumberInput
				value={value}
				onCommit={(n) => binding.commit([fieldKey], n)}
			/>
		);
	}

	return (
		<TextInput
			value={value as string}
			onCommit={(s) => binding.commit([fieldKey], s)}
		/>
	);
};

const GenericField = ({
	component,
	fieldKey,
	value,
	binding,
}: Readonly<{
	component: object;
	fieldKey: string;
	value: unknown;
	binding: FieldBinding;
}>) => {
	const label = toSentenceCase(fieldKey);
	if (typeof value === "boolean") {
		return (
			<Field.Root>
				<Checkbox
					checked={value}
					onCheckedChange={(checked) =>
						binding.commit([fieldKey], checked)
					}
				/>
				<Field.Label>{label}</Field.Label>
			</Field.Root>
		);
	}
	const typeName = serializableTypeName(component);
	const options = typeName
		? fieldOptions(typeName, fieldKey)
		: undefined;
	const requiredMissing = !!options?.required && isEmptyValue(value);
	return (
		<Field.Root invalid={requiredMissing}>
			<Field.Label>{label}</Field.Label>
			<FieldControl
				component={component}
				fieldKey={fieldKey}
				value={value}
				binding={binding}
			/>
			{requiredMissing && <Field.Error match>Required</Field.Error>}
		</Field.Root>
	);
};

const RowView = ({
	component,
	row,
	binding,
}: Readonly<{
	component: object;
	row: Row;
	binding: FieldBinding;
}>) => {
	const record = component as Record<string, unknown>;
	if (row.kind === "single") {
		return (
			<GenericField
				component={component}
				fieldKey={row.key}
				value={record[row.key]}
				binding={binding}
			/>
		);
	}
	return (
		<Field.Row>
			{row.keys.map((key) => (
				<GenericField
					key={key}
					component={component}
					fieldKey={key}
					value={record[key]}
					binding={binding}
				/>
			))}
		</Field.Row>
	);
};

const rowKey = (row: Row): string =>
	row.kind === "single" ? row.key : row.keys.join(",");

const ComponentFields = ({
	component,
	typeName,
	keys,
	binding,
}: Readonly<{
	component: object;
	typeName: string | undefined;
	keys: readonly string[];
	binding: FieldBinding;
}>) => (
	<div className={styles.fields}>
		{buildRows(keys, typeName).map((row) => (
			<RowView
				key={rowKey(row)}
				component={component}
				row={row}
				binding={binding}
			/>
		))}
	</div>
);

const ComponentSection = ({
	component,
	binding,
}: Readonly<{ component: object; binding: FieldBinding }>) => {
	const renderer = getValueRenderer(component);
	const typeName = serializableTypeName(component);
	const fieldKeys = typeName
		? [...(serializableType(typeName)?.fields.keys() ?? [])]
		: [];
	if (!renderer && fieldKeys.length === 0) {
		return null;
	}
	const incomplete = missingRequired(component);
	return (
		<section className={styles.section}>
			<div
				className={
					incomplete
						? `${styles.sectionTitle} ${styles.sectionTitleError}`
						: styles.sectionTitle
				}
			>
				{componentLabel(component)}
				{incomplete && (
					<span
						className={styles.sectionError}
						title="This component has required fields that are not set"
					>
						!
					</span>
				)}
			</div>
			{renderer ? (
				renderer({ value: component, binding })
			) : (
				<ComponentFields
					component={component}
					typeName={typeName}
					keys={fieldKeys}
					binding={binding}
				/>
			)}
		</section>
	);
};

const InspectorBody = ({
	ecs,
	selected,
	document,
	runtime,
}: Readonly<{
	ecs: ECS;
	selected: EntityId;
	document: SceneDocument;
	runtime: boolean;
}>) => (
	<InspectorEcsProvider value={ecs}>
		<div className={styles.inspector}>
			{runtime && (
				<div className={styles.runtimeBadge}>
					Runtime entity — changes won't be saved
				</div>
			)}
			{ecs.componentsOf(selected).map((component) => (
				<ComponentSection
					key={component.constructor.name}
					component={component}
					binding={entityFieldBinding(
						document,
						selected,
						serializableTypeName(component) ?? "",
					)}
				/>
			))}
		</div>
	</InspectorEcsProvider>
);

const Inspector = ({
	ecs,
	store,
	document,
	runtime = false,
}: Readonly<{
	ecs: ECS;
	store: EditorState;
	document: SceneDocument;
	runtime?: boolean;
}>) => {
	const selected = useEditorValue(store, (s) => s.selected);
	const [revision, force] = useReducer((n: number) => n + 1, 0);
	useEffect(() => {
		const unEcs = ecs.subscribe(force);
		const unDoc = document.subscribe(force);
		return () => {
			unEcs();
			unDoc();
		};
	}, [ecs, document]);

	if (!selected) {
		return null;
	}

	return (
		<InspectorBody
			key={revision}
			ecs={ecs}
			selected={selected}
			document={document}
			runtime={runtime}
		/>
	);
};

export const SceneConfigInspector = ({
	scene,
	doc,
}: Readonly<{
	scene: Scene;
	doc: SceneDocument;
}>) => {
	const [revision, force] = useReducer((n: number) => n + 1, 0);
	useEffect(() => doc.subscribe(force), [doc]);
	const config = scene.config;
	return (
		<div className={styles.inspector}>
			<section className={styles.section}>
				<div className={styles.sectionTitle}>World</div>
				<div key={revision}>
					<ComponentFields
						component={config}
						typeName={serializableTypeName(config)}
						keys={Object.keys(config)}
						binding={configFieldBinding(doc)}
					/>
				</div>
			</section>
		</div>
	);
};

export default Inspector;
