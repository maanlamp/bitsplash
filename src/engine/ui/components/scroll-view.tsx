import {
	type ReactNode,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import type { UiFocusEvent, UiWheelEvent } from "../input/ui-event";
import { View } from "../reconciler/ui-elements";
import type { UiNode } from "../reconciler/ui-node";
import type { Style } from "../style/style";

const WHEEL_STEP = 0.5;

const viewport: Style = {
	flexDirection: "column",
	flexShrink: 1,
	overflow: "hidden",
};

const content: Style = { flexDirection: "column", flexShrink: 0 };

const scrollbar: Style = {
	position: "absolute",
	top: 0,
	right: 0,
	width: 2,
	backgroundColor: [1, 1, 1, 0.18],
};

const thumb: Style = {
	position: "absolute",
	right: 0,
	width: 2,
	backgroundColor: [0.86, 0.72, 0.3, 1],
};

const clampOffset = (offset: number, overflow: number): number =>
	Math.max(0, Math.min(offset, overflow));

type Extents = Readonly<{ viewportHeight: number; overflow: number }>;

const NO_EXTENTS: Extents = { viewportHeight: 0, overflow: 0 };

export interface ScrollViewProps {
	style?: Style;
	id?: string;
	children?: ReactNode;
}

/**
 * A clipped viewport for content taller than the room it has.
 *
 * The engine's UI has no scroll primitive: this is a `hidden` overflow box with
 * its content shifted by a relative `top`, which is enough for layout, painting
 * and hit-testing to agree — a row scrolled out of sight is clipped away and
 * cannot be clicked. The wheel scrolls it, and focus landing on a row below the
 * fold scrolls that row into view, so a gamepad reaches everything a pointer
 * can.
 *
 * Give it a bounded height — `flexShrink: 1` inside a parent that is itself
 * bounded, or an explicit `maxHeight`. Unbounded, it simply grows and never
 * scrolls.
 *
 * @example
 * <ScrollView style={{ flexShrink: 1 }}>
 *   {rows}
 * </ScrollView>
 */
export const ScrollView = ({
	style,
	id,
	children,
}: ScrollViewProps) => {
	const [offset, setOffset] = useState(0);
	const [measured, setMeasured] = useState<Extents>(NO_EXTENTS);
	const viewportNode = useRef<UiNode | null>(null);
	const contentNode = useRef<UiNode | null>(null);

	const extents = (): Extents => {
		const outer = viewportNode.current?.layoutRect;
		const inner = contentNode.current?.layoutRect;
		const viewportHeight = outer?.h ?? 0;
		const contentHeight = inner?.h ?? 0;
		return {
			viewportHeight,
			overflow: Math.max(0, contentHeight - viewportHeight),
		};
	};

	/**
	 * Whether the content overflows is a fact about layout, and layout runs
	 * after the commit that produced it — a render can never see its own
	 * result. Nothing re-renders a viewport when the window resizes or its
	 * content grows either, so measuring once on mount leaves the bar wrong for
	 * the rest of the session. Reading the rects each frame and only setting
	 * state when the numbers actually move costs two lookups and is always
	 * right.
	 *
	 * Clamping the offset here is the same fact from the other side: content
	 * that shrank under a scrolled viewport would otherwise leave an empty box
	 * above itself.
	 */
	const measure = useEffectEvent((): void => {
		const live = extents();
		setMeasured((current) =>
			current.viewportHeight === live.viewportHeight &&
			current.overflow === live.overflow
				? current
				: live,
		);
		setOffset((current) => clampOffset(current, live.overflow));
	});

	useEffect(() => {
		let frame = 0;
		const poll = (): void => {
			frame = requestAnimationFrame(poll);
			measure();
		};
		frame = requestAnimationFrame(poll);
		return () => cancelAnimationFrame(frame);
	}, []);

	const onWheel = (event: UiWheelEvent): void => {
		const { overflow } = extents();
		if (overflow <= 0) {
			return;
		}
		setOffset((current) =>
			clampOffset(current + event.deltaY * WHEEL_STEP, overflow),
		);
	};

	const onFocus = (event: UiFocusEvent): void => {
		const outer = viewportNode.current?.layoutRect;
		const rect = event.rect;
		if (!outer || !rect) {
			return;
		}
		const { overflow } = extents();
		if (overflow <= 0) {
			return;
		}
		const above = outer.y - rect.y;
		const below = rect.y + rect.h - (outer.y + outer.h);
		if (above <= 0 && below <= 0) {
			return;
		}
		setOffset((current) =>
			clampOffset(current + (above > 0 ? -above : below), overflow),
		);
	};

	const { viewportHeight, overflow } = measured;
	const contentHeight = viewportHeight + overflow;
	const visible = overflow > 0 && contentHeight > 0;
	const thumbHeight = visible
		? Math.max(8, (viewportHeight / contentHeight) * viewportHeight)
		: 0;
	const thumbTop = visible
		? (offset / overflow) * (viewportHeight - thumbHeight)
		: 0;

	return (
		<View
			id={id}
			ref={viewportNode}
			style={{ ...viewport, ...style }}
			onWheel={onWheel}
			onFocus={onFocus}
		>
			<View
				ref={contentNode}
				style={{ ...content, top: -clampOffset(offset, overflow) }}
			>
				{children}
			</View>
			{visible && (
				<>
					<View style={{ ...scrollbar, height: viewportHeight }} />
					<View
						style={{ ...thumb, top: thumbTop, height: thumbHeight }}
					/>
				</>
			)}
		</View>
	);
};
