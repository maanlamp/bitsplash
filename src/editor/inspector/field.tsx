import { Field as BaseField } from "@base-ui/react/field";
import { Fieldset as BaseFieldset } from "@base-ui/react/fieldset";
import { useRender } from "@base-ui/react/use-render";
import classNames from "classnames";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./field.module.scss";

const Root = ({
	className,
	...props
}: ComponentPropsWithoutRef<typeof BaseField.Root>) => (
	<BaseField.Root
		className={classNames(styles.root, className)}
		{...props}
	/>
);

const Label = ({
	className,
	...props
}: ComponentPropsWithoutRef<typeof BaseField.Label>) => (
	<BaseField.Label
		className={classNames(styles.label, className)}
		{...props}
	/>
);

const ErrorPart = ({
	className,
	...props
}: ComponentPropsWithoutRef<typeof BaseField.Error>) => (
	<BaseField.Error
		className={classNames(styles.error, className)}
		{...props}
	/>
);

const Row = ({
	render,
	className,
	...props
}: useRender.ComponentProps<"div">) =>
	useRender({
		render,
		defaultTagName: "div",
		props: { className: classNames(styles.row, className), ...props },
	});

export const Field = {
	Root,
	Label,
	Error: ErrorPart,
	Row,
};

const FieldsetRoot = ({
	className,
	...props
}: ComponentPropsWithoutRef<typeof BaseFieldset.Root>) => (
	<BaseFieldset.Root
		className={classNames(styles.fieldset, className)}
		{...props}
	/>
);

const FieldsetLegend = ({
	className,
	...props
}: ComponentPropsWithoutRef<typeof BaseFieldset.Legend>) => (
	<BaseFieldset.Legend
		className={classNames(styles.legend, className)}
		{...props}
	/>
);

export const Fieldset = {
	Root: FieldsetRoot,
	Legend: FieldsetLegend,
};

export const Adornment = ({
	render,
	className,
	...props
}: useRender.ComponentProps<"span">) =>
	useRender({
		render,
		defaultTagName: "span",
		props: {
			className: classNames(styles.adornment, className),
			...props,
		},
	});
