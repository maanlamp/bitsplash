import { Checkbox } from "@base-ui/react/checkbox";
import { Select } from "@base-ui/react/select";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import classNames from "classnames";
import {
	Fragment,
	useEffect,
	useReducer,
	useRef,
	useState,
	type ReactNode,
} from "react";
import Angle from "../engine/angle";
import type { ECS, EntityId } from "../engine/ecs";
import {
	fieldEnum,
	isFileField,
	isMultilineField,
} from "../engine/serialization/field-enums";
import { componentTypeName } from "../engine/serialization/registry";
import Vector2 from "../engine/vector2";
import { setField } from "./commands";
import { componentLabel } from "./component-label";
import type { EditorState } from "./editor-state";
import type { History } from "./history";
import styles from "./inspector.module.scss";
import controls from "./styles/controls.module.scss";
import surface from "./styles/surface.module.scss";
import { toSentenceCase } from "./text-case";
import { useEditorValue } from "./use-editor";
import { getValueRenderer } from "./value-renderers";

const commit = (
	history: History,
	target: object,
	key: string,
	after: number | string | boolean,
): void => {
	const record = target as Record<string, number | string | boolean>;
	const before = record[key];
	if (before === after) {
		return;
	}
	setField(history, record, key, before!, after);
};

const NumberField = ({
	value,
	onCommit,
	inlayHint,
}: Readonly<{
	value: number;
	onCommit: (n: number) => void;
	inlayHint?: ReactNode;
}>) => {
	const [text, setText] = useState(String(value));
	const [focused, setFocused] = useState(false);
	useEffect(() => {
		if (!focused) {
			setText(String(value));
		}
	}, [value, focused]);
	const apply = () => {
		const n = Number(text);
		if (Number.isFinite(n)) {
			onCommit(n);
		} else {
			setText(String(value));
		}
	};
	return (
		<label className={styles.fieldInput}>
			{inlayHint && (
				<div className={styles.inlayHint}>{inlayHint}</div>
			)}
			<input
				type="number"
				value={text}
				onFocus={() => setFocused(true)}
				onChange={(e) => setText(e.target.value)}
				onBlur={() => {
					setFocused(false);
					apply();
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.currentTarget.blur();
					}
				}}
			/>
		</label>
	);
};

const TextField = ({
	value,
	onCommit,
}: Readonly<{ value: string; onCommit: (s: string) => void }>) => {
	const [text, setText] = useState(value);
	const [focused, setFocused] = useState(false);
	useEffect(() => {
		if (!focused) {
			setText(value);
		}
	}, [value, focused]);
	return (
		<input
			type="text"
			className={styles.fieldInput}
			value={text}
			onFocus={() => setFocused(true)}
			onChange={(e) => setText(e.target.value)}
			onBlur={() => {
				setFocused(false);
				onCommit(text);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.currentTarget.blur();
				}
			}}
		/>
	);
};

const MultilineField = ({
	value,
	onCommit,
}: Readonly<{ value: string; onCommit: (s: string) => void }>) => {
	const [text, setText] = useState(value);
	const [focused, setFocused] = useState(false);
	useEffect(() => {
		if (!focused) {
			setText(value);
		}
	}, [value, focused]);
	return (
		<textarea
			className={styles.fieldTextarea}
			value={text}
			rows={1}
			onFocus={() => setFocused(true)}
			onChange={(e) => setText(e.target.value)}
			onBlur={() => {
				setFocused(false);
				onCommit(text);
			}}
		/>
	);
};

const EnumField = ({
	value,
	options,
	onCommit,
}: Readonly<{
	value: string;
	options: ReadonlyArray<string>;
	onCommit: (v: string) => void;
}>) => (
	<Select.Root
		value={value}
		onValueChange={(v) => onCommit(v as string)}
	>
		<Select.Trigger className={controls.select}>
			<Select.Value />
			<Select.Icon className={controls.selectIcon}>
				<CaretDownIcon />
			</Select.Icon>
		</Select.Trigger>
		<Select.Portal>
			<Select.Positioner
				sideOffset={4}
				align="start"
				alignItemWithTrigger={false}
			>
				<Select.Popup
					className={classNames(
						surface.surface,
						surface.menu,
						surface.selectPopup,
					)}
				>
					{options.map((option) => (
						<Select.Item
							key={option}
							value={option}
							className={surface.item}
						>
							<Select.ItemText>{option}</Select.ItemText>
						</Select.Item>
					))}
				</Select.Popup>
			</Select.Positioner>
		</Select.Portal>
	</Select.Root>
);

const FileField = ({
	value,
	accept,
	onCommit,
}: Readonly<{
	value: string;
	accept: string;
	onCommit: (s: string) => void;
}>) => {
	const ref = useRef<HTMLInputElement>(null);
	return (
		<button
			type="button"
			onClick={() => {
				ref.current?.click();
			}}
			aria-label="Select file"
			className={styles.fileInputWrapper}
		>
			<span>{value}</span>
			<input
				ref={ref}
				type="file"
				className={styles.fileInput}
				accept={accept}
				onChange={async (e) => {
					const file = e.target.files?.[0];
					if (!file) {
						return;
					}
					// TODO: This violates our import polarity policy.
					// TODO: This also should not hardcode ../game/assets at all.
					// I want this to be able to import ANY file. We can POST
					// the file to the vite dev server to get arbitrary FS access,
					// but idk what the next step would be.
					const BAD_URL_THAT_VIOLATES_IMPORT_POLICY = await import(
						`../game/assets/${file.name}?url`
					).then((mod) => mod["default"]);
					onCommit(BAD_URL_THAT_VIOLATES_IMPORT_POLICY);
				}}
			/>
		</button>
	);
};

export const Vector2Field = ({
	value,
	history,
}: Readonly<{
	value: Vector2;
	history: History;
}>) => (
	<div className={styles.vec2}>
		<NumberField
			value={value.x}
			onCommit={(n) => commit(history, value, "x", n)}
			inlayHint="X"
		/>
		<NumberField
			value={value.y}
			onCommit={(n) => commit(history, value, "y", n)}
			inlayHint="Y"
		/>
	</div>
);

export const AngleField = ({
	component,
	fieldKey,
	value,
	history,
}: Readonly<{
	component: object;
	fieldKey: string;
	value: Angle;
	history: History;
}>) => (
	<NumberField
		value={value.radians}
		onCommit={(n) => commit(history, component, fieldKey, n)}
	/>
);

const FieldControl = ({
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
	if (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value)
	) {
		const renderer = getValueRenderer(value);
		if (renderer) {
			return <>{renderer({ value, history, component, fieldKey })}</>;
		}
	}

	if (typeof value === "boolean") {
		return (
			<Checkbox.Root
				checked={value}
				onCheckedChange={(checked) =>
					commit(history, component, fieldKey, checked)
				}
				className={styles.checkbox}
			>
				<Checkbox.Indicator className={styles.checkboxIndicator}>
					<CheckIcon weight="bold" />
				</Checkbox.Indicator>
			</Checkbox.Root>
		);
	}
	if (typeof value === "number") {
		return (
			<NumberField
				value={value}
				onCommit={(n) => commit(history, component, fieldKey, n)}
			/>
		);
	}

	const typeName = componentTypeName(component);

	const accept = typeName
		? isFileField(typeName, fieldKey)
		: undefined;
	if (accept !== undefined) {
		return (
			<FileField
				value={value as string}
				accept={accept}
				onCommit={(s) => commit(history, component, fieldKey, s)}
			/>
		);
	}

	const options = typeName
		? fieldEnum(typeName, fieldKey)
		: undefined;
	if (options) {
		return (
			<EnumField
				value={value as string}
				options={options}
				onCommit={(v) => commit(history, component, fieldKey, v)}
			/>
		);
	}

	if (typeName && isMultilineField(typeName, fieldKey)) {
		return (
			<MultilineField
				value={value as string}
				onCommit={(s) => commit(history, component, fieldKey, s)}
			/>
		);
	}

	return (
		<TextField
			value={value as string}
			onCommit={(s) => commit(history, component, fieldKey, s)}
		/>
	);
};

const ComponentSection = ({
	component,
	history,
}: Readonly<{ component: object; history: History }>) => {
	const entries = Object.entries(component);
	if (entries.length === 0) {
		return null;
	}
	return (
		<section className={styles.section}>
			<div className={styles.sectionTitle}>
				{componentLabel(component)}
			</div>
			<div className={styles.fields}>
				{entries.map(([key, value]) => (
					<Fragment key={key}>
						<span className={styles.fieldLabel}>
							{toSentenceCase(key)}
						</span>
						<FieldControl
							component={component}
							fieldKey={key}
							value={value}
							history={history}
						/>
					</Fragment>
				))}
			</div>
		</section>
	);
};

const InspectorBody = ({
	ecs,
	selected,
	history,
}: Readonly<{ ecs: ECS; selected: EntityId; history: History }>) => (
	<div className={styles.inspector}>
		{ecs.componentsOf(selected).map((component) => (
			<ComponentSection
				key={component.constructor.name}
				component={component}
				history={history}
			/>
		))}
	</div>
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

export default Inspector;
