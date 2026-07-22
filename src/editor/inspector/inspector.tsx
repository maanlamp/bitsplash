import clsx from "clsx";
import { useEffect, useReducer, useSyncExternalStore } from "react";
import { AssetRef } from "../../engine/asset-ref";
import type { ECS, EntityId } from "../../engine/ecs";
import {
	componentClass,
	fieldOptions,
	serializableType,
	serializableTypeName,
} from "../../engine/serialization/registry";
import type { Scene } from "../../engine/scene/scene";
import { walkFields } from "../../engine/serialization/value";
import {
	configFieldBinding,
	entityFieldBinding,
	type FieldBinding,
	multiEntityFieldBinding,
} from "../commands";
import { componentLabel } from "../component-label";
import type { SelectionChannel } from "../selection-channel";
import { toSentenceCase } from "../text-case";
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

const MixedHint = () => (
	<span className={styles.mixed}>Multiple values</span>
);

const GenericField = ({
	component,
	fieldKey,
	value,
	binding,
	mixed = false,
}: Readonly<{
	component: object;
	fieldKey: string;
	value: unknown;
	binding: FieldBinding;
	mixed?: boolean;
}>) => {
	const label = toSentenceCase(fieldKey);
	if (typeof value === "boolean") {
		return (
			<Field.Root>
				<Checkbox
					checked={value}
					indeterminate={mixed}
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
			<Field.Label>
				{label}
				{mixed && <MixedHint />}
			</Field.Label>
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
	mixedKeys,
}: Readonly<{
	component: object;
	row: Row;
	binding: FieldBinding;
	mixedKeys?: ReadonlySet<string>;
}>) => {
	const record = component as Record<string, unknown>;
	if (row.kind === "single") {
		return (
			<GenericField
				component={component}
				fieldKey={row.key}
				value={record[row.key]}
				binding={binding}
				mixed={mixedKeys?.has(row.key)}
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
					mixed={mixedKeys?.has(key)}
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
	mixedKeys,
}: Readonly<{
	component: object;
	typeName: string | undefined;
	keys: readonly string[];
	binding: FieldBinding;
	mixedKeys?: ReadonlySet<string>;
}>) => (
	<div className={styles.fields}>
		{buildRows(keys, typeName).map((row) => (
			<RowView
				key={rowKey(row)}
				component={component}
				row={row}
				binding={binding}
				mixedKeys={mixedKeys}
			/>
		))}
	</div>
);

const ComponentSection = ({
	component,
	binding,
	mixedKeys,
}: Readonly<{
	component: object;
	binding: FieldBinding;
	mixedKeys?: ReadonlySet<string>;
}>) => {
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
				className={clsx(
					styles.sectionTitle,
					incomplete && styles.sectionTitleError,
				)}
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
					mixedKeys={mixedKeys}
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

/** Component type names present on every entity in `ids`. */
const commonComponentTypes = (
	ecs: ECS,
	ids: ReadonlyArray<EntityId>,
): ReadonlySet<string> => {
	const perEntity = ids.map(
		(id) =>
			new Set(
				ecs
					.componentsOf(id)
					.map((c) => serializableTypeName(c) ?? ""),
			),
	);
	const first = perEntity[0];
	if (!first) {
		return new Set();
	}
	return new Set(
		[...first].filter(
			(name) => name !== "" && perEntity.every((s) => s.has(name)),
		),
	);
};

/**
 * The field keys of `typeName` whose serialized value is not identical across
 * every selected entity — the ones the inspector flags "multiple values".
 */
const mixedFieldKeys = (
	ecs: ECS,
	ids: ReadonlyArray<EntityId>,
	typeName: string,
): ReadonlySet<string> => {
	const type = serializableType(typeName);
	const cls = componentClass(typeName);
	if (!type || !cls) {
		return new Set();
	}
	const serialized = ids.map((id) => {
		const component = ecs.getComponent(id, cls);
		return component ? walkFields(type, component) : null;
	});
	const mixed = new Set<string>();
	for (const key of type.fields.keys()) {
		const reference = JSON.stringify(serialized[0]?.[key]);
		if (
			serialized.some((s) => JSON.stringify(s?.[key]) !== reference)
		) {
			mixed.add(key);
		}
	}
	return mixed;
};

const MultiInspectorBody = ({
	ecs,
	ids,
	primaryId,
	document,
}: Readonly<{
	ecs: ECS;
	ids: ReadonlyArray<EntityId>;
	primaryId: EntityId;
	document: SceneDocument;
}>) => {
	const common = commonComponentTypes(ecs, ids);
	return (
		<InspectorEcsProvider value={ecs}>
			<div className={styles.inspector}>
				<div className={styles.runtimeBadge}>
					{ids.length} entities selected — edits apply to all
				</div>
				{ecs
					.componentsOf(primaryId)
					.filter((component) =>
						common.has(serializableTypeName(component) ?? ""),
					)
					.map((component) => {
						const typeName = serializableTypeName(component) ?? "";
						return (
							<ComponentSection
								key={component.constructor.name}
								component={component}
								binding={multiEntityFieldBinding(
									document,
									ids,
									typeName,
								)}
								mixedKeys={mixedFieldKeys(ecs, ids, typeName)}
							/>
						);
					})}
			</div>
		</InspectorEcsProvider>
	);
};

const Inspector = ({
	channel,
	runtime = false,
}: Readonly<{
	channel: SelectionChannel;
	runtime?: boolean;
}>) => {
	const snapshot = useSyncExternalStore(
		channel.subscribe,
		() => channel.snapshot,
	);
	const ecs = snapshot?.ecs ?? null;
	const document = snapshot?.document ?? null;
	const [revision, force] = useReducer((n: number) => n + 1, 0);
	useEffect(() => {
		if (!ecs || !document) {
			return;
		}
		const unEcs = ecs.subscribe(force);
		const unDoc = document.subscribe(force);
		return () => {
			unEcs();
			unDoc();
		};
	}, [ecs, document]);

	const selected = snapshot?.selection.primaryId ?? null;
	if (!snapshot || !ecs || !document || !selected) {
		return null;
	}

	if (snapshot.selection.ids.size > 1) {
		return (
			<MultiInspectorBody
				key={revision}
				ecs={ecs}
				ids={[...snapshot.selection.ids]}
				primaryId={selected}
				document={document}
			/>
		);
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
