import Flex, { FlexDirection, FlexProps } from "layout/flex";

const Row = <As extends keyof HTMLElementTagNameMap>(props: FlexProps<As>) => (
	<Flex direction={FlexDirection.Row} {...props} />
);

export default Row;
