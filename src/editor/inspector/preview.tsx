import { useRender } from "@base-ui/react/use-render";
import clsx from "clsx";
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
			className: clsx(styles.root, className),
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
			className: clsx(styles.body, className),
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
		props: { className: clsx(styles.box, className), ...props },
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
			className: clsx(styles.inputs, className),
			...props,
		},
	});

export const Preview = { Root, Body, Box, Inputs };
