import { beforeAll, expect, test } from "bun:test";
import {
	createElement,
	type ElementType,
	type ReactElement,
	type ReactNode,
	useState,
} from "react";
import { DynStore } from "../src/engine/ui/bypass/dyn-store";
import { UiRoot } from "../src/engine/ui/reconciler/ui-root";
import type { YogaBridge } from "../src/engine/ui/reconciler/yoga-bridge";

type H = (
	type: ElementType,
	props: object | null,
	...children: ReactNode[]
) => ReactElement;
const h = createElement as unknown as H;

beforeAll(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = false;
});

const makeBridge = () => {
	const live = new Set<number>();
	const counts = { created: 0, freed: 0 };
	const bridge: YogaBridge = {
		create(node) {
			node.yoga = { id: node.id };
			live.add(node.id);
			counts.created++;
		},
		free(node) {
			live.delete(node.id);
			counts.freed++;
		},
		applyStyle() {},
	};
	return { bridge, live, counts };
};

let setLabel: (value: string) => void = () => {};
let setShow: (value: boolean) => void = () => {};
const sharedStyle = { color: "#fff" };

const App = (): ReactElement => {
	const [label, updateLabel] = useState("a");
	const [show, updateShow] = useState(true);
	setLabel = updateLabel;
	setShow = updateShow;
	return h(
		"view",
		{ id: "root", style: sharedStyle },
		h("text", { style: sharedStyle }, label),
		show ? h("view", { id: "child" }, h("text", null, "x")) : null,
	);
};

const mountApp = (bridge?: YogaBridge): UiRoot => {
	const root = new UiRoot({ yoga: bridge });
	root.flushSyncFromReconciler(() => root.mount(h(App, null)));
	return root;
};

test("mounts the element tree onto the container", () => {
	const root = mountApp();
	const view = root.tree.children[0]!;
	expect(view.type).toBe("view");
	expect(view.props.id).toBe("root");
	expect(view.children).toHaveLength(2);
	expect(view.children[0]!.type).toBe("text");
	expect(view.children[0]!.props.children).toBe("a");
	expect(view.children[1]!.type).toBe("view");
});

test("commitUpdate writes only changed keys and never replaces props", () => {
	const root = mountApp();
	const text = root.tree.children[0]!.children[0]!;
	const propsRef = text.props;
	const styleRef = text.props.style;
	const idRef = text.id;

	root.flushSyncFromReconciler(() => setLabel("b"));

	const textAfter = root.tree.children[0]!.children[0]!;
	expect(textAfter).toBe(text);
	expect(textAfter.id).toBe(idRef);
	expect(textAfter.props).toBe(propsRef);
	expect(textAfter.props.style).toBe(styleRef);
	expect(textAfter.props.children).toBe("b");
});

test("bypass values survive an unrelated reconcile", () => {
	const root = mountApp();
	const dyn = new DynStore();
	const view = root.tree.children[0]!;
	dyn.set(view.id, { alpha: 0.5, offsetX: 12 });

	root.flushSyncFromReconciler(() => setLabel("c"));

	const viewAfter = root.tree.children[0]!;
	expect(viewAfter.id).toBe(view.id);
	expect(dyn.get(view.id)?.alpha).toBe(0.5);
	expect(dyn.get(view.id)?.offsetX).toBe(12);
});

test("yoga nodes are created and freed leak-safe", () => {
	const { bridge, live, counts } = makeBridge();
	const root = mountApp(bridge);

	const childView = root.tree.children[0]!.children[1]!;
	const childText = childView.children[0]!;
	expect(live.has(childView.id)).toBe(true);
	expect(live.has(childText.id)).toBe(true);
	const freedBefore = counts.freed;

	root.flushSyncFromReconciler(() => setShow(false));

	expect(counts.freed).toBe(freedBefore + 2);
	expect(live.has(childView.id)).toBe(false);
	expect(live.has(childText.id)).toBe(false);

	root.flushSyncFromReconciler(() => root.unmount());

	expect([...live]).toEqual([root.tree.id]);
});
