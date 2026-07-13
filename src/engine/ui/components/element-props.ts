import type { ReactNode } from "react";
import type {
	FocusDirection,
	UiCancelEvent,
	UiClickEvent,
	UiConfirmEvent,
	UiFocusMoveEvent,
	UiPointerEvent,
	UiWheelEvent,
} from "../input/ui-event";
import type { Style } from "../style/style";

export interface AnchorSpec {
	world: { x: number; y: number };
	edgeClamp?: boolean;
	pointToward?: { x: number; y: number };
}

export interface ViewElementProps {
	style?: Style;
	id?: string;
	focusable?: boolean;
	focusGroup?: string;
	focusNeighbors?: Partial<Record<FocusDirection, string>>;
	anchor?: AnchorSpec;
	onPointerDown?: (event: UiPointerEvent) => void;
	onPointerUp?: (event: UiPointerEvent) => void;
	onPointerMove?: (event: UiPointerEvent) => void;
	onClick?: (event: UiClickEvent) => void;
	onWheel?: (event: UiWheelEvent) => void;
	onFocus?: () => void;
	onBlur?: () => void;
	onFocusMove?: (event: UiFocusMoveEvent) => boolean | void;
	onConfirm?: (event: UiConfirmEvent) => void;
	onCancel?: (event: UiCancelEvent) => void;
	children?: ReactNode;
}
