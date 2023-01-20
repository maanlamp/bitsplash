import Flex, {
	CrossAxisAlignment,
	FlexProps,
	MainAxisAlignment,
} from "layout/flex";

const Center = <As extends keyof HTMLElementTagNameMap>(
	props: FlexProps<As>
) => (
	<Flex
		mainAxisAlignment={MainAxisAlignment.Center}
		crossAxisAlignment={CrossAxisAlignment.Center}
		{...props}
	/>
);

export default Center;
