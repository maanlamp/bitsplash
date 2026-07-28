import type { DeviceSnapshot } from "../../input/device-snapshot";
import type { UiNode } from "../reconciler/ui-node";
import { FocusNav } from "./focus-nav";
import { InputNormalizer } from "./input-normalizer";
import { maskedInput, WHEEL_TOKEN } from "./masked-input";
import { buildPath, handlerOf, nearestFocusable } from "./node-tree";
import { PointerRouter } from "./pointer-router";
import type {
	UiClickEvent,
	UiEvent,
	UiEventEntry,
	UiFocusMoveEvent,
	UiPointerEvent,
	UiWheelEvent,
} from "./ui-event";
import { UiEventQueue } from "./ui-event-queue";

const POINTER_TOKENS: readonly string[] = [
	"mouse:left",
	"mouse:middle",
	"mouse:right",
	"mouse:back",
	"mouse:forward",
	WHEEL_TOKEN,
];

const HANDLER_NAMES: Readonly<Record<string, string>> = {
	pointerdown: "onPointerDown",
	pointerup: "onPointerUp",
	pointermove: "onPointerMove",
	click: "onClick",
	wheel: "onWheel",
	confirm: "onConfirm",
	cancel: "onCancel",
	focusmove: "onFocusMove",
};

type DispatchResult = {
	ran: boolean;
	defaultPrevented: boolean;
};

const isPointerType = (type: string): boolean =>
	type === "pointerdown" ||
	type === "pointerup" ||
	type === "pointermove" ||
	type === "click" ||
	type === "wheel";

export class UiEventDispatcher {
	readonly queue = new UiEventQueue();
	readonly normalizer = new InputNormalizer();
	readonly router = new PointerRouter();
	readonly focusNav = new FocusNav();

	private readonly consumedTokens = new Set<string>();
	private pressed: UiNode | null = null;
	private modalNode: UiNode | null = null;

	get consumed(): ReadonlySet<string> {
		return this.consumedTokens;
	}

	get events(): readonly UiEventEntry[] {
		return this.queue.entries;
	}

	get modal(): boolean {
		return this.modalNode !== null;
	}

	setModal(node: UiNode | null): void {
		this.modalNode = node;
		if (node) {
			this.focusNav.setTrap(node);
		} else {
			this.focusNav.clearTrap();
		}
	}

	/**
	 * Keeps focus and the modal trap consistent with the tree when `node`
	 * leaves it. Focus re-resolves to the nearest remaining chain neighbour
	 * (firing its `onFocus`) rather than being stranded on a detached node,
	 * where confirm/cancel would silently dispatch to nothing.
	 */
	nodeRemoved(root: UiNode, node: UiNode): void {
		if (this.modalNode === node) {
			this.setModal(null);
		}
		if (this.focusNav.trap === node) {
			this.focusNav.clearTrap();
		}
		const replacement = this.focusNav.nodeRemoved(root, node);
		if (replacement) {
			this.fireSimple(replacement, "onFocus");
		}
	}

	maskedInput(source: DeviceSnapshot): DeviceSnapshot {
		return maskedInput(source, this.consumedTokens, this.modal);
	}

	clearEvents(): void {
		this.queue.clear();
	}

	dispatch(
		root: UiNode,
		input: DeviceSnapshot,
		uiScale: number,
		dt: number,
	): void {
		this.consumedTokens.clear();
		this.queue.clear();
		this.normalizer.sample(
			input,
			this.queue,
			uiScale,
			dt,
			this.focusNav.trap !== null,
		);

		const hitRoot = this.modalNode ?? root;
		const pointer = this.router.toUiSpace(
			input.mouse.position.x,
			input.mouse.position.y,
			uiScale,
		);
		const hover = this.router.hitTest(hitRoot, pointer.x, pointer.y);
		if (hover) {
			for (const tk of POINTER_TOKENS) {
				this.consumedTokens.add(tk);
			}
		}

		for (const entry of this.queue.entries) {
			this.dispatchEntry(root, hitRoot, entry);
		}
	}

	private dispatchEntry(
		root: UiNode,
		hitRoot: UiNode,
		entry: UiEventEntry,
	): void {
		const event = entry.event;
		if (isPointerType(event.type)) {
			this.dispatchPointer(root, hitRoot, entry);
			return;
		}
		if (event.type === "focusmove") {
			this.dispatchFocusMove(root, entry);
			return;
		}
		this.dispatchConfirmCancel(root, entry);
	}

	private dispatchPointer(
		root: UiNode,
		hitRoot: UiNode,
		entry: UiEventEntry,
	): void {
		const event = entry.event as
			| UiPointerEvent
			| UiClickEvent
			| UiWheelEvent;
		const target = this.router.hitTest(
			hitRoot,
			event.position.x,
			event.position.y,
		);

		if (event.type === "pointerdown") {
			this.pressed = target;
		}

		if (!target) {
			return;
		}

		if (event.type === "click") {
			const matched = this.pressed === target;
			this.pressed = null;
			if (!matched) {
				return;
			}
		}

		this.dispatchToTarget(root, target, event);

		if (event.type === "pointerdown") {
			const focusable = nearestFocusable(root, target);
			if (focusable) {
				this.setFocus(focusable);
			}
		}
	}

	private dispatchFocusMove(root: UiNode, entry: UiEventEntry): void {
		const direction = (entry.event as UiFocusMoveEvent).direction;
		let ran = false;
		let defaultPrevented = false;

		const focused = this.focusNav.focused;
		if (focused) {
			const result = this.dispatchToTarget(
				root,
				focused,
				entry.event,
			);
			ran = result.ran;
			defaultPrevented = result.defaultPrevented;
		}

		let moved = false;
		if (!defaultPrevented) {
			const previous = this.focusNav.focused;
			const target = this.focusNav.move(root, direction);
			if (target && target !== previous) {
				moved = true;
				if (previous) {
					this.fireSimple(previous, "onBlur");
				}
				this.fireSimple(target, "onFocus");
			}
		}

		if (ran || moved) {
			this.consume(entry);
		}
	}

	private dispatchConfirmCancel(
		root: UiNode,
		entry: UiEventEntry,
	): void {
		const focused = this.focusNav.focused;
		if (!focused) {
			return;
		}
		const result = this.dispatchToTarget(root, focused, entry.event);
		if (result.ran) {
			this.consume(entry);
		}
	}

	private setFocus(node: UiNode): void {
		if (this.focusNav.focused === node) {
			return;
		}
		const previous = this.focusNav.focus(node);
		if (previous) {
			this.fireSimple(previous, "onBlur");
		}
		this.fireSimple(node, "onFocus");
	}

	private fireSimple(node: UiNode, name: string): void {
		const handler = handlerOf(node, name);
		if (handler) {
			handler(undefined);
		}
	}

	private consume(entry: UiEventEntry): void {
		entry.consumed = true;
		for (const tk of this.normalizer.tokensFor(entry)) {
			this.consumedTokens.add(tk);
		}
	}

	private dispatchToTarget(
		root: UiNode,
		target: UiNode,
		event: UiEvent,
	): DispatchResult {
		const path = buildPath(root, target);
		if (path.length === 0) {
			return { ran: false, defaultPrevented: false };
		}
		const name = HANDLER_NAMES[event.type];
		if (!name) {
			return { ran: false, defaultPrevented: false };
		}
		const captureName = `${name}Capture`;

		let propagationStopped = false;
		let immediateStopped = false;
		let defaultPrevented = false;
		let ran = false;

		Object.assign(event, {
			stopPropagation(): void {
				propagationStopped = true;
			},
			stopImmediatePropagation(): void {
				propagationStopped = true;
				immediateStopped = true;
			},
			preventDefault(): void {
				defaultPrevented = true;
			},
		});

		for (let i = 0; i < path.length; i++) {
			if (propagationStopped) {
				break;
			}
			const handler = handlerOf(path[i]!, captureName);
			if (handler) {
				ran = true;
				if (handler(event) === true) {
					defaultPrevented = true;
				}
				if (immediateStopped) {
					return { ran, defaultPrevented };
				}
			}
		}

		for (let i = path.length - 1; i >= 0; i--) {
			if (propagationStopped) {
				break;
			}
			const handler = handlerOf(path[i]!, name);
			if (handler) {
				ran = true;
				if (handler(event) === true) {
					defaultPrevented = true;
				}
				if (immediateStopped) {
					return { ran, defaultPrevented };
				}
			}
		}

		return { ran, defaultPrevented };
	}
}
