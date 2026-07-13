import { createContext } from "react";
import Reconciler from "react-reconciler";
import {
	DefaultEventPriority,
	NoEventPriority,
} from "react-reconciler/constants";
import type { Style } from "../style/style";
import type { UiNode } from "./ui-node";
import type { YogaBridge } from "./yoga-bridge";

type Type = string;
type Props = Record<string, unknown>;
type Container = UiNode;
type Instance = UiNode;
type TextInstance = UiNode;
type HostContext = object;

export type UiHostConfig = Reconciler.HostConfig<
	Type,
	Props,
	Container,
	Instance,
	TextInstance,
	never,
	never,
	never,
	Instance,
	HostContext,
	never,
	ReturnType<typeof setTimeout>,
	-1,
	null
>;

export type HostConfigOptions = {
	yoga?: YogaBridge;
	onAfterCommit?(): void;
};

const TEXT_NODE = "#text";
const HOST_CONTEXT: object = {};
const EMPTY_STYLE: Style = {};

const styleOf = (props: Props): Style =>
	(props.style as Style | undefined) ?? EMPTY_STYLE;

const makeNode = (
	id: number,
	type: string,
	props: Props,
): UiNode => ({
	type,
	props,
	children: [],
	id,
});

const assignChanged = (
	target: Props,
	prev: Props,
	next: Props,
): void => {
	for (const key in next) {
		if (next[key] !== prev[key]) {
			target[key] = next[key];
		}
	}
	for (const key in prev) {
		if (!(key in next)) {
			delete target[key];
		}
	}
};

export const createHostConfig = (
	options: HostConfigOptions = {},
): UiHostConfig => {
	const yoga = options.yoga;
	let nextId = 1;
	let currentPriority: number = NoEventPriority;

	const detach = (parent: UiNode, child: UiNode): void => {
		const index = parent.children.indexOf(child);
		if (index >= 0) {
			parent.children.splice(index, 1);
		}
	};

	const insert = (
		parent: UiNode,
		child: UiNode,
		before: UiNode | null,
	): void => {
		const existing = parent.children.indexOf(child);
		if (existing >= 0) {
			parent.children.splice(existing, 1);
		}
		const at = before ? parent.children.indexOf(before) : -1;
		const index = at >= 0 ? at : parent.children.length;
		parent.children.splice(index, 0, child);
	};

	const freeSubtree = (node: UiNode): void => {
		for (const child of node.children) {
			freeSubtree(child);
		}
		if (node.yoga !== undefined) {
			yoga?.free(node);
			node.yoga = undefined;
		}
	};

	const transitionContext = createContext<null>(
		null,
	) as unknown as UiHostConfig["HostTransitionContext"];

	return {
		supportsMutation: true,
		supportsPersistence: false,
		supportsHydration: false,
		isPrimaryRenderer: false,
		supportsMicrotasks: true,
		warnsIfNotActing: false,
		noTimeout: -1,
		NotPendingTransition: null,
		HostTransitionContext: transitionContext,

		createInstance(type, props) {
			const node = makeNode(nextId++, type, { ...props });
			yoga?.create(node);
			yoga?.applyStyle(node, styleOf(node.props));
			return node;
		},

		createTextInstance(text) {
			const node = makeNode(nextId++, TEXT_NODE, { text });
			yoga?.create(node);
			yoga?.applyStyle(node, EMPTY_STYLE);
			return node;
		},

		appendInitialChild(parent, child) {
			insert(parent, child, null);
		},

		finalizeInitialChildren() {
			return false;
		},

		shouldSetTextContent(type) {
			return type === "text";
		},

		getRootHostContext() {
			return HOST_CONTEXT;
		},

		getChildHostContext() {
			return HOST_CONTEXT;
		},

		getPublicInstance(instance) {
			return instance;
		},

		prepareForCommit() {
			return null;
		},

		resetAfterCommit() {
			options.onAfterCommit?.();
		},

		preparePortalMount() {},

		scheduleTimeout(fn, delay) {
			return setTimeout(fn, delay);
		},

		cancelTimeout(id) {
			clearTimeout(id);
		},

		scheduleMicrotask(fn) {
			queueMicrotask(fn);
		},

		getInstanceFromNode() {
			return null;
		},

		beforeActiveInstanceBlur() {},
		afterActiveInstanceBlur() {},
		prepareScopeUpdate() {},
		getInstanceFromScope() {
			return null;
		},

		setCurrentUpdatePriority(priority) {
			currentPriority = priority;
		},

		getCurrentUpdatePriority() {
			return currentPriority;
		},

		resolveUpdatePriority() {
			return currentPriority !== NoEventPriority
				? currentPriority
				: DefaultEventPriority;
		},

		resetFormInstance() {},
		requestPostPaintCallback() {},
		shouldAttemptEagerTransition() {
			return false;
		},
		trackSchedulerEvent() {},
		resolveEventType() {
			return null;
		},
		resolveEventTimeStamp() {
			return -1;
		},
		maySuspendCommit() {
			return false;
		},
		preloadInstance() {
			return true;
		},
		startSuspendingCommit() {},
		suspendInstance() {},
		waitForCommitToBeReady() {
			return null;
		},

		appendChild(parent, child) {
			insert(parent, child, null);
		},

		appendChildToContainer(container, child) {
			insert(container, child, null);
		},

		insertBefore(parent, child, before) {
			insert(parent, child, before);
		},

		insertInContainerBefore(container, child, before) {
			insert(container, child, before);
		},

		removeChild(parent, child) {
			detach(parent, child);
			freeSubtree(child);
		},

		removeChildFromContainer(container, child) {
			detach(container, child);
			freeSubtree(child);
		},

		commitUpdate(instance, _type, prevProps, nextProps) {
			assignChanged(instance.props, prevProps, nextProps);
			yoga?.applyStyle(instance, styleOf(instance.props));
		},

		commitTextUpdate(textInstance, _oldText, newText) {
			textInstance.props.text = newText;
			yoga?.applyStyle(textInstance, EMPTY_STYLE);
		},

		detachDeletedInstance(node) {
			if (node.yoga !== undefined) {
				yoga?.free(node);
				node.yoga = undefined;
			}
		},

		clearContainer(container) {
			for (const child of container.children) {
				freeSubtree(child);
			}
			container.children.length = 0;
		},
	};
};
