import type { ReactNode } from "react";
import type { DeviceSnapshot } from "../input/device-snapshot";
import {
	AnchorSystem,
	type AnchorCamera,
} from "./bypass/anchor-system";
import { DynStore } from "./bypass/dyn-store";
import { UiEventDispatcher } from "./input/event-dispatcher";
import { YogaBridge } from "./layout/yoga-bridge";
import {
	createTextMeasureProvider,
	type FontResolver,
} from "./layout/measure-text";
import {
	UiRenderSystem,
	type UiFontProvider,
} from "./paint/ui-render-system";
import type { UiNode } from "./reconciler/ui-node";
import { UiRoot } from "./reconciler/ui-root";

export type UiRuntimeOptions = Readonly<{
	resolveFont: FontResolver;
	font: UiFontProvider;
	anchorInset?: number;
}>;

const IDENTITY_CAMERA: AnchorCamera = {
	worldToScreenX: (x) => x,
	worldToScreenY: (y) => y,
};

export class UiRuntime {
	readonly dyn = new DynStore();
	readonly bridge: YogaBridge;
	readonly root: UiRoot;
	readonly dispatcher = new UiEventDispatcher();
	readonly anchor: AnchorSystem;
	readonly paintSystem: UiRenderSystem;

	constructor(options: UiRuntimeOptions) {
		this.bridge = new YogaBridge(
			createTextMeasureProvider(options.resolveFont),
		);
		this.root = new UiRoot({ yoga: this.bridge });
		this.anchor = new AnchorSystem(this.root, this.dyn, {
			inset: options.anchorInset,
		});
		this.paintSystem = new UiRenderSystem(
			this.root,
			this.dyn,
			options.font,
		);
	}

	mount(element: ReactNode): void {
		this.root.mount(element);
	}

	get modal(): boolean {
		return this.dispatcher.modal;
	}

	setModal(node: UiNode | null): void {
		this.dispatcher.setModal(node);
	}

	enqueueIntent(intent: () => void): void {
		this.root.enqueueIntent(intent);
	}

	step(
		input: DeviceSnapshot,
		uiScale: number,
		dtSeconds: number,
		runGameplay: (masked: DeviceSnapshot) => void,
	): void {
		this.root.flushSyncFromReconciler(() => {
			this.dispatcher.dispatch(
				this.root.tree,
				input,
				uiScale,
				dtSeconds,
			);
			const masked = this.dispatcher.maskedInput(input);
			runGameplay(masked);
			this.root.drainIntents();
		});
	}

	layout(
		uiScale: number,
		width: number,
		height: number,
		camera: AnchorCamera = IDENTITY_CAMERA,
	): void {
		const scale = uiScale || 1;
		this.bridge.calculate(
			this.root.tree,
			width / scale,
			height / scale,
		);
		this.anchor.update({
			camera,
			uiScale: scale,
			viewportWidth: width,
			viewportHeight: height,
		});
	}

	clearEvents(): void {
		this.dispatcher.clearEvents();
	}
}
