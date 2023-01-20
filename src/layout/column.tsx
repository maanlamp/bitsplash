import Flex, { FlexDirection, FlexProps } from "layout/flex";

const Column = <As extends keyof HTMLElementTagNameMap>(
	props: FlexProps<As>
) => <Flex direction={FlexDirection.Column} {...props} />;

export default Column;
