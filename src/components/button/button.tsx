import { CrossAxisAlignment, FlexProps } from "layout/flex";
import { Padding } from "layout/layout";
import Row from "layout/row";
import { useState } from "react";
import "./button.scss";

type ButtonState = Readonly<{
	busy: boolean;
	error?: any;
}>;

type ButtonVariant = "primary" | "secondary";

type ButtonProps = Omit<FlexProps<"button">, "onClick" | "type"> &
	Readonly<{
		onClick?: () => Promise<any> | void;
		type?: string;
		busy?: boolean;
		variant?: ButtonVariant;
	}>;

const Button = ({
	onClick,
	type = "button",
	busy: forceBusy,
	variant = "secondary",
	...props
}: ButtonProps) => {
	const [{ busy, error }, setState] = useState<ButtonState>({ busy: false });

	const handleClick = (_onClick: typeof onClick) => async () => {
		setState({ busy: true, error: undefined });
		try {
			await _onClick?.();
		} catch (error) {
			setState(state => ({ ...state, error }));
		} finally {
			setState(state => ({ ...state, busy: false }));
		}
	};

	return (
		<Row
			as="button"
			crossAxisAlignment={CrossAxisAlignment.Center}
			classes={["button", variant, busy && "busy", error && "error"]}
			onClick={handleClick(onClick)}
			padding={Padding.Small}
			// @ts-ignore
			disabled={forceBusy || busy}
			type={type}
			{...props}
		/>
	);
};

export default Button;
