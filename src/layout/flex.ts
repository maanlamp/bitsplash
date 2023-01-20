import {
	Classes,
	classes,
	Gap,
	Padding,
	paddingToString,
	Rect,
} from "layout/layout";
import "layout/layout.scss";
import "layout/typography.scss";
import React from "react";

export enum FlexDirection {
	/** Cause a `Flex` container to flow horizontally, left to right.
	 *
	 * This means its main axis is horizontal, and its cross/wrap axis is vertical.
	 *
	 * This is the default behaviour of a `Flex` container.
	 */
	Row = "row",

	/** Cause a `Flex` container to flow vertically, up to down.
	 *
	 * This means its main axis is vertical, and its cross/wrap axis is horizontal.
	 */
	Column = "column",
}

export enum MainAxisAlignment {
	/** Cause a `Flex` container to pack all items to the start of its main axis. For a row, this is horizontal; for a column, this is vertical.
	 *
	 * This is the default behaviour of a `Flex` container.
	 */
	Start = "axis-main-flex-start",

	/** Cause a `Flex` container to pack all items from the centre of its main axis. For a row, this is horizontal; for a column, this is vertical.
	 *
	 * If it looks like this alignment doesn't work, you probably need to `grow` this container for it to have available space to distribute.
	 *
	 * @see CustomFlexProps.grow for documentation on how to allow elements to take up more space if they can.
	 */
	Center = "axis-main-center",

	/** Cause a `Flex` container to pack all items to the end of its main axis. For a row, this is horizontal; for a column, this is vertical.
	 *
	 * A simple use case would be to align chat messages to the bottom of a column.
	 */
	End = "axis-main-flex-end",

	/** Cause a `Flex` container to pack all elements with as much space between them as possible along the main axis. For a row, this is horizontal; for a column, this is vertical.
	 *
	 * A simple use case would be to align two children opposite to eachother, such as in a header.
	 */
	SpaceBetween = "axis-main-space-between",
}

export enum CrossAxisAlignment {
	/** Cause a `Flex` container to pack all items to the start of its cross axis. For a row, this is vertical; for a column, this is horizontal.
	 *
	 * This is ***not the default*** `CrossAxisAlignment`; see `CrossAxisAlignment.Stretch`.
	 */
	Start = "axis-cross-flex-start",

	/** Cause a `Flex` container to pack all items from the centre of its cross axis. For a row, this is vertical; for a column, this is horizontal.
	 *
	 * If it looks like this alignment doesn't work, you probably need to tell the parent of this container to change its `CrossAxisAlignment` too.
	 */
	Center = "axis-cross-center",

	/** Cause a `Flex` container to pack all items to the end of its cross axis. For a row, this is vertical; for a column, this is horizontal.
	 */
	End = "axis-cross-flex-end",

	/** Cause a `Flex` container to stretch all items over its entire cross axis. For a row, this is vertical; for a column, this is horizontal.
	 *
	 * This is the default behaviour of a `Flex` container.
	 */
	Stretch = "axis-cross-stretch",

	/** Cause a `Flex` container to pack all items along the baseline, which is roughly equal to the perpendicular text flow axis.
	 *
	 * Sometimes a `CrossAxisAlignment.Center` looks just a little off. In such a case, try this instead.
	 */
	Baseline = "axis-cross-baseline",
}

export enum WrapAlignment {
	/** Cause a `Flex` container to wrap all items from the start of its cross axis. For a row, this is vertical; for a column, this is horizontal.
	 *
	 * This is ***not the default*** `CrossAxisAlignment`; see `CrossAxisAlignment.Stretch`.
	 */
	Start = "wrap-flex-start",

	/** Cause a `Flex` container to wrap all items from the centre of its cross axis. For a row, this is vertical; for a column, this is horizontal.
	 *
	 * If it looks like this alignment doesn't work, you probably need to tell the parent of this container to change its `CrossAxisAlignment` too.
	 */
	Center = "wrap-center",

	/** Cause a `Flex` container to wrap all items from the end of its cross axis. For a row, this is vertical; for a column, this is horizontal.
	 */
	End = "wrap-flex-end",

	/** Cause a `Flex` container to stretch all items over its entire cross axis when wrapping. For a row, this is vertical; for a column, this is horizontal.
	 *
	 * This is the default behaviour of a `Flex` container.
	 */
	Stretch = "wrap-stretch",

	/** Cause a `Flex` container to wrap all items along their baselines, which is roughly equal to the perpendicular text flow axis.
	 *
	 * Sometimes a `WrapAlignment.Center` looks just a little off. In such a case, try this instead.
	 */
	Baseline = "wrap-baseline",

	/** Cause a `Flex` container to wrap all elements with as much space between them as possible along the cross axis. For a row, this is vertical; for a column, this is horizontal.
	 */
	SpaceBetween = "wrap-space-between",
}

export enum TextAlignment {
	/** Aligns text to the start of the container's text axis.
	 *
	 * It is important to note that this _isn't_ the left, per se, as writing direction changes what "start" means. Text direction `ltr` (western text direction) is different from `rtl` (arabic text direction).*/
	Start = "text-start",

	/** Aligns text to the center of the container's text axis. */
	Center = "text-center",

	/** Aligns text to the end of the container's text axis.
	 *
	 * It is important to note that this _isn't_ the right, per se, as writing direction changes what "end" means. Text direction `ltr` (western text direction) is different from `rtl` (arabic text direction).*/
	End = "text-end",

	/** Have the text follow the container's main axis alignment.
	 *
	 * @see MainAxisAlignment
	 */
	MainAxis = "text-main-axis",
}

export enum Positioning {
	/** The element is positioned according to the normal flow of the document.
	 *
	 * This is the default value.
	 */
	Static = "position-static",

	/** The element is positioned according to the normal flow of the document, and then offset relative to its parent.
	 *
	 * This value might create a new stacking context in certain cases.
	 */
	Relative = "position-relative",

	/** The element is removed from the normal document flow, and no space is created for the element in the page layout. It is positioned relative to its closest positioned ancestor/containing block.
	 *
	 * This value might create a new stacking context in certain cases.
	 */
	Absolute = "position-absolute",

	/** The element is removed from the normal document flow, and no space is created for the element in the page layout. It is positioned relative to the initial containing block established by the viewport
	 *
	 * This value _always_ creates a new stacking context.
	 */
	Fixed = "position-fixed",

	/** The element is positioned according to the normal flow of the document, and then offset relative to its nearest scrolling ancestor and containing block.
	 *
	 * This value _always_ creates a new stacking context.
	 */
	Sticky = "position-sticky",
}

type CustomFlexProps = Readonly<{
	/** The children of a `Flex` container will flow either horizontally (`FlexDirection.Row`), or vertically (`FlexDirection.Column`).
	 *
	 * The `direction` you choose will thus determine how children will be laid out, and which axis is the _main_, and which is the _cross_ axis.
	 *
	 * ![](https://res.cloudinary.com/practicaldev/image/fetch/s---3gDSFf1--/c_limit%2Cf_auto%2Cfl_progressive%2Cq_auto%2Cw_880/https://dev-to-uploads.s3.amazonaws.com/i/fsln7je4ax7ft3er28hh.png)
	 *
	 * The default `direction` of a `Flex` element is `FlexDirection.Row`.
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/flex-direction for more information on the underlying CSS property.
	 */
	direction?: FlexDirection;

	/** The children of a `Flex` container will flow either horizontally (`FlexDirection.Row`), or vertically (`FlexDirection.Column`).
	 *
	 * The value for `wrap` you choose will determine if, once all children no longer fit in the `Flex` element, those children are allowed to span a new _flex line_ along its _main axis_, instead of _shrinking_ to fit. Note that any child whose `shrink` is false, ***will not shrink***.
	 *
	 * ![](https://res.cloudinary.com/practicaldev/image/fetch/s----O5J3PQ--/c_limit%2Cf_auto%2Cfl_progressive%2Cq_auto%2Cw_880/https://dev-to-uploads.s3.amazonaws.com/i/4jkkaafn2ef4osrtmhyg.png)
	 *
	 * By default, `wrap` is not defined, meaning its children ***are not allowed*** to wrap, and thus will ask its children to _shrink_.
	 *
	 * @see CustomFlexProps.shrink For more details on how `Flex` items would shrink if asked to.
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/flex-wrap for more information on the underlying CSS property.
	 */
	wrap?: true;

	/** When a `Flex` container is larger along its ***main axis*** than its children, those children will be asked to increase in size according to their `grow` factor.
	 *
	 * A grow factor of `true` is treated as `1`, meaning it will share all leftover space equally with its siblings with the same factor.
	 *
	 * When a numerical `grow` factor is specified, this child will share its parent's extra space according to the ratio between it's and its sibling's `grow` factors (e.g. a factor of `2` will grow into twice as much space as a factor of `1`).
	 *
	 * This property does not prevent a `Flex` element from `shrink`ing.
	 *
	 * By default, items will not grow beyond their `width` and/or `basis`.
	 *
	 * @see CustomFlexProps.shrink For more details on how `Flex` items would shrink if asked to.
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/flex-grow for more information on the underlying CSS property.
	 */
	grow?: true | number;

	/** When a `Flex` container is smaller along its ***main axis*** than its children, those children will be asked to decrease in size according to their `shrink` factor.
	 *
	 * A shrink factor of `false` is treated as `0`, meaning it will not shrink, regardless of its siblings.
	 *
	 * When a numerical `shrink` factor is specified, this child will shrink into its parent's available space according to the ratio between it's and its sibling's `shrink` factors (e.g. a factor of `2` will shrink twice as much as a factor of `1`).
	 *
	 * This property does not prevent a `Flex` element from `grow`ing.
	 *
	 * By default, items ***will shrink*** beyond their `width` and/or `basis`.
	 *
	 * @see CustomFlexProps.grow For more details on how `Flex` items would grow if asked to.
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/flex-shrink for more information on the underlying CSS property.
	 */
	shrink?: false | number;

	/** The children of a `Flex` container will flow either horizontally (`FlexDirection.Row`), or vertically (`FlexDirection.Column`).
	 *
	 * The axis along which the items flow is called the _main axis_. The `MainAxisAlignment` determines the alignment of all children along this axis. Example uses are `MainAxisAlignment.Center` to center items, or `MainAxisAlignment.End` for an alignment to the end of the axis.
	 *
	 * The default `alignment` of the main axis is `MainAxisAlignment.Start`, which aligns all items to the beginning of the main axis. For a row, this is the left; for a column, it's the top.
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content for more information on the underlying CSS property.
	 */
	mainAxisAlignment?: MainAxisAlignment;

	/** The children of a `Flex` container will wrap either horizontally or vertically. The axis along which the items wrap is called the _cross axis_.
	 *
	 * The `CrossAxisAlignment` determines the alignment of all children along this axis. Example uses are `CrossAxisAlignment.Center` to center items, or `CrossAxisAlignment.End` for a reversed normal alignment.
	 *
	 * The default `alignment` of the cross axis is `CrossAxisAlignment.Stretch`, which stretches all items along the entire cross axis. For a row, this is the vertical axis; for a column, it's the horizontal axis.
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/align-items for more information on the underlying CSS property.
	 */
	crossAxisAlignment?: CrossAxisAlignment;

	/** The children of a `Flex` container will wrap either horizontally or vertically. The axis along which the items wrap is called the _cross axis_. This same axis is used to determine how to align items within a wrapped flexbox.
	 *
	 * The `WrapAlignment` determines the alignment of all wrapped children along this axis within the flexbox. Example uses are `WrapAlignment.Center` to center wrapped items, or `WrapAlignment.End` for an alingment to the end of the wrapped box.
	 *
	 * The default `alignment` of wrapped items is `WrapAlignment.Stretch`, which stretches all items along the entire cross axis. For a row, this is the vertical axis; for a column, it's the horizontal axis.
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/align-content for more information on the underlying CSS property.
	 */
	wrapAlignment?: WrapAlignment;

	/** The text within a `Flex` container ***does not*** flow along its main axis. This property is what you need!
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/writing-mode for cases where "start" and "end" aren't left/right.
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/text-orientation for cases where "start" and "end" aren't left/right.
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/direction for cases where "start" and "end" aren't left/right.
	 */
	textAlignment?: TextAlignment;

	/** A type-safe set of `Gap` values. The `gap` is the space between rows and columns (also sometimes called gutters).
	 *
	 * This property sets a `gap` for both the main and cross axis.
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/gap for more information on the underlying CSS property.
	 */
	gap?: Gap;

	/** A type-safe set of `Padding` values, or a `Rect` version thereof. This is to make sure you use consistent padding across your entire app -- keep your designers happy!
	 *
	 * To add a padding all around an item, use a plain `Padding` value.
	 *
	 * To add a padding to one or more specific sides, use a `Rect` object with on of its keys defined as a `Padding` value. Can be combined with an `AxisRect`.
	 *
	 * To add a symmetrical padding to one or more specific sides, use an `AxisRect` object with on of its axes defined as a `Padding` value. Can be combined with a normal `Rect`.
	 *
	 * @see Rect to see how to define `Padding` for specific sides.
	 * @see AxisRect to see how to define `Padding` for one or two independent axes.
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/padding for more information on the underlying CSS property.
	 */
	padding?: Padding | Partial<Rect<Padding>>;

	/** To add a class to an HTML element, you need to do a lot of string interpolation and filtering. This property does all that work for you, and provides a declarative API for passing conditional classes.
	 *
	 * @see paddingToString for its implementation.
	 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/class for more information on the underlying HTML attribute.
	 */
	classes?: Classes;

	/** All HTML elements are normally laid out according to their parent and the siblings that came before it. To change how an element is positioned, you can specify another `positioning` in the parent.
	 *
	 * @see Positioning for all possible values.
	 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/position for more information on the underlying CSS property.
	 */
	positioning?: Positioning;
}>;

/** A value version of the `CustomFlexProps` type, allowing requiring/omitting
 * of these props. To extend the `CustomFlexProps` without sending those
 * props the the underlying elements, you must add it here as well.
 */
const customKeys: Record<keyof Required<CustomFlexProps>, true> = {
	direction: true,
	wrap: true,
	grow: true,
	shrink: true,
	mainAxisAlignment: true,
	crossAxisAlignment: true,
	wrapAlignment: true,
	textAlignment: true,
	gap: true,
	padding: true,
	classes: true,
	positioning: true,
};

const omitCustomProps = (
	props: FlexProps<any>
): Omit<FlexProps<any>, keyof typeof customKeys> =>
	Object.fromEntries(
		Object.entries(props).filter(([key]) => !(customKeys as any)[key])
	);

export type FlexProps<As extends keyof HTMLElementTagNameMap> =
	CustomFlexProps &
		Readonly<{
			/** To render a `Flex` container as a specific element, provide a string to `as`. This will then render that element with that tag, and tell your IDE to give (type-)hints according to that tagname.
			 *
			 * This way you can use proper semantic HTML and have it all work with the `Flex` and `Layout` API's.
			 */
			as?: As;
		}> &
		React.HTMLAttributes<HTMLElementTagNameMap[As]>;

const Flex = <As extends keyof HTMLElementTagNameMap>({
	as,
	...props
}: FlexProps<As>) =>
	React.createElement(as ?? "div", {
		...omitCustomProps(props),
		style:
			props.grow || props.shrink
				? {
						flexGrow: props.grow !== undefined ? Number(props.grow) : undefined,
						flexShrink:
							props.shrink !== undefined ? Number(props.shrink) : undefined,
						...props.style,
				  }
				: props.style,
		className: classes([
			props.className,
			"flex",
			props.direction,
			props.wrap && "wrap",
			props.gap,
			props.mainAxisAlignment,
			props.crossAxisAlignment,
			props.wrapAlignment,
			props.textAlignment,
			props.padding && paddingToString(props.padding),
			props.classes,
			props.positioning,
		]),
	});

export default Flex;
