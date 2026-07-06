import { useRender } from "@base-ui/react/use-render";
import classNames from "classnames";
import styles from "./preview.module.scss";

const Root = ({
	render,
	className,
	...props
}: useRender.ComponentProps<"div">) =>
	useRender({
		render,
		defaultTagName: "div",
		props: {
			className: classNames(styles.root, className),
			...props,
		},
	});

const Body = ({
	render,
	className,
	...props
}: useRender.ComponentProps<"div">) =>
	useRender({
		render,
		defaultTagName: "div",
		props: {
			className: classNames(styles.body, className),
			...props,
		},
	});

const Box = ({
	render,
	className,
	...props
}: useRender.ComponentProps<"div">) =>
	useRender({
		render,
		defaultTagName: "div",
		props: { className: classNames(styles.box, className), ...props },
	});

const Inputs = ({
	render,
	className,
	...props
}: useRender.ComponentProps<"div">) =>
	useRender({
		render,
		defaultTagName: "div",
		props: {
			className: classNames(styles.inputs, className),
			...props,
		},
	});

export const Preview = { Root, Body, Box, Inputs };
