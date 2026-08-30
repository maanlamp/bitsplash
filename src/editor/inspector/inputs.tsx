import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Input } from "@base-ui/react/input";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { Select } from "@base-ui/react/select";
import { CaretDownIcon } from "@phosphor-icons/react/dist/icons/CaretDown";
import { CaretUpIcon } from "@phosphor-icons/react/dist/icons/CaretUp";
import { CheckIcon } from "@phosphor-icons/react/dist/icons/Check";
import { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/icons/DotsSixVertical";
import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import type { SelectOption } from "../../engine/serialization/serializable-value";
import { openFileDialog, resolveToWebPath } from "../project-io";
import controls from "../styles/controls.module.scss";
import surface from "../styles/surface.module.scss";
import { usePortalContainer } from "../window/portal-container";
import styles from "./inputs.module.scss";

export const NumberInput = ({
	value,
	onCommit,
	children,
	step,
	largeStep,
	min,
	max,
}: Readonly<{
	value: number;
	onCommit: (n: number) => void;
	children?: ReactNode;
	step?: number;
	largeStep?: number;
	min?: number;
	max?: number;
}>) => (
	<BaseNumberField.Root
		className={styles.numberField}
		value={value}
		step={step}
		largeStep={largeStep}
		min={min}
		max={max}
		onValueCommitted={(next) => {
			if (next !== null && Number.isFinite(next)) {
				onCommit(next);
			}
		}}
	>
		<BaseNumberField.Group className={styles.input}>
			<BaseNumberField.ScrubArea className={styles.scrub}>
				{children ?? (
					<span className={styles.grip} aria-hidden>
						<DotsSixVerticalIcon />
					</span>
				)}
				<BaseNumberField.ScrubAreaCursor />
			</BaseNumberField.ScrubArea>
			<BaseNumberField.Input className={styles.numberInput} />
			<div className={styles.steppers}>
				<BaseNumberField.Increment className={styles.stepper}>
					<CaretUpIcon />
				</BaseNumberField.Increment>
				<BaseNumberField.Decrement className={styles.stepper}>
					<CaretDownIcon />
				</BaseNumberField.Decrement>
			</div>
		</BaseNumberField.Group>
	</BaseNumberField.Root>
);

export const TextInput = ({
	value,
	onCommit,
}: Readonly<{
	value: string;
	onCommit: (s: string) => void;
}>) => {
	const [text, setText] = useState(value);
	const [focused, setFocused] = useState(false);
	useEffect(() => {
		if (!focused) {
			setText(value);
		}
	}, [value, focused]);
	return (
		<Input
			className={styles.input}
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

const optionEntries = (
	options: readonly SelectOption[],
): ReadonlyArray<{ label: string; value: string | number }> =>
	options.map((option) =>
		typeof option === "string"
			? { label: option, value: option }
			: option,
	);

export const EnumSelect = ({
	value,
	options,
	onCommit,
}: Readonly<{
	value: string | number;
	options: readonly SelectOption[];
	onCommit: (v: string | number) => void;
}>) => {
	const entries = optionEntries(options);
	const container = usePortalContainer();
	return (
		<Select.Root<string | number>
			value={value}
			onValueChange={(v) => onCommit(v as string | number)}
		>
			<Select.Trigger className={controls.select}>
				<Select.Value>
					{(selected) =>
						entries.find((e) => e.value === selected)?.label ??
						String(selected)
					}
				</Select.Value>
				<Select.Icon className={controls.selectIcon}>
					<CaretDownIcon />
				</Select.Icon>
			</Select.Trigger>
			<Select.Portal container={container}>
				<Select.Positioner
					sideOffset={4}
					align="start"
					alignItemWithTrigger={false}
				>
					<Select.Popup
						className={clsx(
							surface.surface,
							surface.menu,
							surface.selectPopup,
						)}
					>
						{entries.map((entry) => (
							<Select.Item
								key={String(entry.value)}
								value={entry.value}
								className={surface.item}
							>
								<Select.ItemText>{entry.label}</Select.ItemText>
							</Select.Item>
						))}
					</Select.Popup>
				</Select.Positioner>
			</Select.Portal>
		</Select.Root>
	);
};

export const FileInput = ({
	value,
	accept,
	onCommit,
}: Readonly<{
	value: string;
	accept: string;
	onCommit: (s: string) => void;
}>) => (
	<button
		type="button"
		onClick={() => {
			void openFileDialog(accept).then((path) => {
				if (path) {
					void resolveToWebPath(path).then(onCommit);
				}
			});
		}}
		aria-label="Select file"
		className={styles.fileInput}
	>
		<span className={value ? undefined : styles.filePlaceholder}>
			{value || "Choose a file…"}
		</span>
	</button>
);

export const Checkbox = ({
	checked,
	onCheckedChange,
	indeterminate = false,
}: Readonly<{
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	indeterminate?: boolean;
}>) => (
	<BaseCheckbox.Root
		checked={checked}
		indeterminate={indeterminate}
		onCheckedChange={onCheckedChange}
		className={styles.checkbox}
	>
		<BaseCheckbox.Indicator className={styles.checkboxIndicator}>
			<CheckIcon weight="bold" />
		</BaseCheckbox.Indicator>
	</BaseCheckbox.Root>
);
