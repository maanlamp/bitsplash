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

export type UiRect = Readonly<{
	x: number;
	y: number;
	w: number;
	h: number;
}>;

/**
 * Focus arriving at or leaving a node. Bubbles, and carries the focused node's
 * laid-out rect so an ancestor (a scrolling viewport) can react to where focus
 * went without holding a reference to the node itself.
 *
 * Focus says only "this is the element under attention". It carries no notion
 * of where it came from, because there is nothing to tell apart: a gamepad
 * landing on a control and a pointer hovering it produce the same event, and
 * neither activates anything. Activation is `click` and `confirm`, and a
 * control that acts on `focus` is a control that will fire when someone sweeps
 * a mouse past it.
 */
export interface UiFocusEvent {
	type: "focus" | "blur";
	rect: UiRect | null;
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
	| UiFocusEvent
	| UiConfirmEvent
	| UiCancelEvent;

export interface UiEventEntry {
	event: UiEvent;
	consumed: boolean;
}
