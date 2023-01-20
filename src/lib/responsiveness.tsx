import { ReactNode, useEffect, useState } from "react";

/** All supported screen sizes in your app (_specifically the width_).
 *
 * Feel free to alter, but that's generally not necessary.
 */
export enum ScreenSize {
	/** 640 × 480 Standard Definition (SD) / 480p */
	XS = 640,
	/** 1280 × 720 High Definition (HD) / 720p */
	S = 1280,
	/** 1920×1080 Full High Definition (FHD) / 1080p */
	M = 1920,
	/** 2560×1440 Quad High Definition (QHD) / 1440p */
	L = 2560,
	/** 3840×2160 Ultra High Definition (UHD) / 4k */
	XL = 3840,
}

/** A hook version of CSS media queries.
 *
 * Provide a query in string form, and you will get a boolean that tells you if it matches the current user agent.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/@media for information on the underlying CSS technology
 */
const useMatchMedia = (query: string) => {
	const [doesMatch, setDoesMatch] = useState(false);

	useEffect(() => {
		const mediaQuery = window.matchMedia(query);
		const handler = (event: MediaQueryListEvent) => setDoesMatch(event.matches);

		setDoesMatch(mediaQuery.matches);
		mediaQuery.addEventListener("change", handler);

		return () => mediaQuery.removeEventListener("change", handler);
	}, []);

	return doesMatch;
};

type MatchedBreakpoints = Readonly<{
	active: ScreenSize;
	"<": (size: ScreenSize) => boolean;
	">": (size: ScreenSize) => boolean;
	"<=": (size: ScreenSize) => boolean;
	">=": (size: ScreenSize) => boolean;
}>;

/** A hook for matching breakpoints against the viewport.
 *
 * This hook registers actual media-queries, but skips the CSS dependency to work declaratively in your markup.
 *
 * You can use this hook for conditional rendering and/or providing conditional props.
 *
 * Returns `MatchedBreakpoints` which is an object that maps all `ScreenSize`s to booleans, indicating whether the viewport is at least that size.
 *
 * The closest matched breakpoint is also passed as the property `closest`.
 */
export const useBreakpoints = () => {
	// This record can't be generated automatically because of the rules of hooks
	// so it has to be updated everytime you add a screensize.
	// The type annotation will prevent compilation when incomplete.
	const query: Record<ScreenSize, ReturnType<typeof useMatchMedia>> = {
		[ScreenSize.XS]: useMatchMedia(`(min-width: ${ScreenSize.XS}px)`),
		[ScreenSize.S]: useMatchMedia(`(min-width: ${ScreenSize.S}px)`),
		[ScreenSize.M]: useMatchMedia(`(min-width: ${ScreenSize.M}px)`),
		[ScreenSize.L]: useMatchMedia(`(min-width: ${ScreenSize.L}px)`),
		[ScreenSize.XL]: useMatchMedia(`(min-width: ${ScreenSize.XL}px)`),
	};

	const getMatchedSizeIndex = (size: ScreenSize) => {
		const bools = Object.entries(query)
			.filter(([, v]) => typeof v === "boolean")
			.map(([, v]) => v);
		return {
			bools,
			index: Object.values(ScreenSize)
				.filter(x => typeof x === "number")
				.findIndex(s => s === size),
		};
	};

	const sizes = Object.entries(ScreenSize)
		.filter(([k]) => Number.isNaN(parseInt(k)))
		.map(([, v]) => v)
		.reverse() as ReadonlyArray<ScreenSize>;
	const activeIndex = sizes.findIndex(size => query[size]);
	return {
		active: sizes[activeIndex >= 0 ? activeIndex : sizes.length - 1],
		"<": (size: ScreenSize) => {
			const { bools, index } = getMatchedSizeIndex(size);
			return !bools[index];
		},
		"<=": (size: ScreenSize) => {
			const { bools, index } = getMatchedSizeIndex(size);
			return !bools[index + 1];
		},
		">": (size: ScreenSize) => {
			const { bools, index } = getMatchedSizeIndex(size);
			return !!bools[index];
		},
		">=": (size: ScreenSize) => {
			const { bools, index } = getMatchedSizeIndex(size);
			return bools.slice(0, index + 1).every(b => b === true);
		},
	};
};

type ResponsiveProps = Readonly<{
	children: (sizes: MatchedBreakpoints) => ReactNode;
}>;

/** Element form of `useBreakpoints`.
 *
 * Requires a function child which will be called with breakpoints currently matched against the screen size.
 *
 * @see useBreakpoints for its implementation
 */
export const Responsive = (props: ResponsiveProps) => {
	const query = useBreakpoints();
	return props.children(query) as JSX.Element;
};

type BreakpointProps = Readonly<{
	size: ScreenSize;
	children?: ReactNode;
}>;

/** An element that will only render its children when the current screen size matches the provided breakpoint `size`.
 *
 * @see Responsive to find out how to match breakpoints more generally
 * @see useBreakpoints to find out how to match breakpoints more generally
 */
export const Breakpoint = ({ size, children }: BreakpointProps) => {
	const { active } = useBreakpoints();
	return (size === active ? children : null) as JSX.Element;
};
