import { useEffect, useReducer } from "react";
import { AssetRef } from "../../engine/asset-ref";
import type { ECS, EntityId } from "../../engine/ecs";
import {
	fieldOptions,
	serializableType,
	serializableTypeName,
} from "../../engine/serialization/registry";
import type { Scene } from "../../engine/scene/scene";
import { setField } from "../commands";
import { componentLabel } from "../component-label";
import type { EditorState } from "../editor-state";
import type { History } from "../history";
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

export const commit = (
	history: History,
	target: object,
	key: string,
	after: number | string | boolean | null,
): void => {
	const record = target as Record<
		string,
		number | string | boolean | null
	>;
	const before = record[key];
	if (before === after) {
		return;
	}
	setField(history, record, key, before!, after);
};

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
	history,
}: Readonly<{
	component: object;
	fieldKey: string;
	value: unknown;
	history: History;
}>) => {
	if (isValueObject(value)) {
		const renderer = getValueRenderer(value);
		if (renderer) {
			return <>{renderer({ value, history, component, fieldKey })}</>;
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
				onCommit={(v) => commit(history, component, fieldKey, v)}
			/>
		);
	}

	if (typeof value === "number") {
		return (
			<NumberInput
				value={value}
				onCommit={(n) => commit(history, component, fieldKey, n)}
			/>
		);
	}

	return (
		<TextInput
			value={value as string}
			onCommit={(s) => commit(history, component, fieldKey, s)}
		/>
	);
};

const GenericField = ({
	component,
	fieldKey,
	value,
	history,
}: Readonly<{
	component: object;
	fieldKey: string;
	value: unknown;
	history: History;
}>) => {
	const label = toSentenceCase(fieldKey);
	if (typeof value === "boolean") {
		return (
			<Field.Root>
				<Checkbox
					checked={value}
					onCheckedChange={(checked) =>
						commit(history, component, fieldKey, checked)
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
				history={history}
			/>
			{requiredMissing && <Field.Error match>Required</Field.Error>}
		</Field.Root>
	);
};

const RowView = ({
	component,
	row,
	history,
}: Readonly<{ component: object; row: Row; history: History }>) => {
	const record = component as Record<string, unknown>;
	if (row.kind === "single") {
		return (
			<GenericField
				component={component}
				fieldKey={row.key}
				value={record[row.key]}
				history={history}
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
					history={history}
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
	history,
}: Readonly<{
	component: object;
	typeName: string | undefined;
	keys: readonly string[];
	history: History;
}>) => (
	<div className={styles.fields}>
		{buildRows(keys, typeName).map((row) => (
			<RowView
				key={rowKey(row)}
				component={component}
				row={row}
				history={history}
			/>
		))}
	</div>
);

const ComponentSection = ({
	component,
	history,
}: Readonly<{ component: object; history: History }>) => {
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
				renderer({
					value: component,
					history,
					component,
					fieldKey: "",
				})
			) : (
				<ComponentFields
					component={component}
					typeName={typeName}
					keys={fieldKeys}
					history={history}
				/>
			)}
		</section>
	);
};

const InspectorBody = ({
	ecs,
	selected,
	history,
}: Readonly<{ ecs: ECS; selected: EntityId; history: History }>) => (
	<InspectorEcsProvider value={ecs}>
		<div className={styles.inspector}>
			{ecs.componentsOf(selected).map((component) => (
				<ComponentSection
					key={component.constructor.name}
					component={component}
					history={history}
				/>
			))}
		</div>
	</InspectorEcsProvider>
);

const Inspector = ({
	ecs,
	store,
	history,
}: Readonly<{ ecs: ECS; store: EditorState; history: History }>) => {
	const selected = useEditorValue(store, (s) => s.selected);
	const [revision, force] = useReducer((n: number) => n + 1, 0);
	useEffect(() => {
		const unEcs = ecs.subscribe(force);
		const unHistory = history.subscribe(force);
		return () => {
			unEcs();
			unHistory();
		};
	}, [ecs, history]);

	if (!selected) {
		return null;
	}

	return (
		<InspectorBody
			key={revision}
			ecs={ecs}
			selected={selected}
			history={history}
		/>
	);
};

export const SceneConfigInspector = ({
	scene,
	doc,
	history,
}: Readonly<{
	scene: Scene;
	doc: SceneDocument;
	history: History;
}>) => {
	const [revision, force] = useReducer((n: number) => n + 1, 0);
	useEffect(
		() =>
			history.subscribe(() => {
				scene.applyConfig();
				doc.markDirty();
				force();
			}),
		[scene, doc, history],
	);
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
						history={history}
					/>
				</div>
			</section>
		</div>
	);
};

export default Inspector;
