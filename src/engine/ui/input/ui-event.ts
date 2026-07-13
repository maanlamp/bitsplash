export type UiEventPoint = Readonly<{ x: number; y: number }>;

export type PointerButton =
	| "left"
	| "middle"
	| "right"
	| "back"
	| "forward";

export type FocusDirection = "up" | "down" | "left" | "right";

export type UiPointerType =
	| "pointerdown"
	| "pointerup"
	| "pointermove";

export interface UiPointerEvent {
	type: UiPointerType;
	position: UiEventPoint;
	button: PointerButton | null;
}

export interface UiClickEvent {
	type: "click";
	position: UiEventPoint;
	button: PointerButton;
}

export interface UiWheelEvent {
	type: "wheel";
	position: UiEventPoint;
	deltaX: number;
	deltaY: number;
}

export interface UiFocusMoveEvent {
	type: "focusmove";
	direction: FocusDirection;
}

export interface UiConfirmEvent {
	type: "confirm";
}

export interface UiCancelEvent {
	type: "cancel";
}

export type UiEvent =
	| UiPointerEvent
	| UiClickEvent
	| UiWheelEvent
	| UiFocusMoveEvent
	| UiConfirmEvent
	| UiCancelEvent;

export interface UiEventEntry {
	event: UiEvent;
	consumed: boolean;
}
