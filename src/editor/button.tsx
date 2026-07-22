import { Button as BaseButton } from "@base-ui/react/button";
import clsx from "clsx";
import type { ComponentProps } from "react";
import styles from "./button.module.scss";

type Variant = "text" | "icon" | "primary" | "secondary" | "tertiary";

type ButtonProps = Readonly<
	Omit<ComponentProps<typeof BaseButton>, "className"> & {
		variant?: Variant;
		className?: string;
	}
>;

const Button = ({
	variant = "text",
	className,
	...props
}: ButtonProps) => (
	<BaseButton
		className={clsx(styles.button, styles[variant], className)}
		{...props}
	/>
);

export default Button;
