import type { ReactNode } from "react";
import Reconciler from "react-reconciler";
import { LegacyRoot } from "react-reconciler/constants";
import {
	createHostConfig,
	type HostConfigOptions,
} from "./host-config";
import type { UiNode } from "./ui-node";
import type { YogaBridge } from "./yoga-bridge";

export type UiRootOptions = {
	yoga?: YogaBridge;
	onAfterCommit?(): void;
};

const noop = (): void => {};

const reportError = (error: Error): void => {
	console.error(error);
};

export class UiRoot {
	readonly container: UiNode;
	private readonly reconciler: Reconciler.Reconciler<
		UiNode,
		UiNode,
		UiNode,
		never,
		never,
		UiNode
	>;
	private readonly root: unknown;
	private readonly intents: Array<() => void> = [];
	private mounted = false;

	constructor(options: UiRootOptions = {}) {
		this.container = {
			type: "#root",
			props: {},
			children: [],
			id: 0,
		};
		options.yoga?.create(this.container);

		const config: HostConfigOptions = {
			yoga: options.yoga,
			onAfterCommit: () => options.onAfterCommit?.(),
		};
		this.reconciler = Reconciler(createHostConfig(config));
		this.root = this.reconciler.createContainer(
			this.container,
			LegacyRoot,
			null,
			false,
			null,
			"",
			reportError,
			reportError,
			reportError,
			noop,
		);
	}

	get tree(): UiNode {
		return this.container;
	}

	mount(element: ReactNode): void {
		if (this.mounted) {
			throw new Error("UiRoot already mounted");
		}
		this.mounted = true;
		this.reconciler.updateContainer(element, this.root, null, null);
	}

	unmount(): void {
		this.reconciler.updateContainer(null, this.root, null, null);
		this.mounted = false;
	}

	flushSyncFromReconciler<R>(fn: () => R): R {
		return this.reconciler.flushSyncFromReconciler(fn);
	}

	enqueueIntent(intent: () => void): void {
		this.intents.push(intent);
	}

	drainIntents(): void {
		for (const intent of this.intents) {
			intent();
		}
		this.intents.length = 0;
	}
}
