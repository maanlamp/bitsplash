import { describe, expect, test } from "bun:test";
import Viewport from "../src/engine/camera/viewport";

/**
 * Headless coverage for WS-D2: the viewport must read `devicePixelRatio` and
 * construct its `ResizeObserver` from the **owning** window of the container it
 * mounts in, and `reattach` must recreate the canvas in the destination
 * document (a GL canvas cannot survive `adoptNode`). Real DOM/WebGL behaviour
 * is validated live; these fakes assert the wiring only.
 */

type ObserveCall = { observer: FakeResizeObserver; target: unknown };

class FakeResizeObserver {
	static readonly observed: ObserveCall[] = [];
	disconnected = false;
	constructor(readonly callback: () => void) {}
	observe(target: unknown): void {
		FakeResizeObserver.observed.push({ observer: this, target });
	}
	disconnect(): void {
		this.disconnected = true;
	}
}

class FakeWindow {
	readonly ResizeObserver = FakeResizeObserver;
	constructor(readonly devicePixelRatio: number) {}
}

class FakeCanvas {
	tabIndex = 0;
	className = "";
	width = 0;
	height = 0;
	style: Record<string, string> & { cssText: string } = {
		cssText: "",
	} as Record<string, string> & { cssText: string };
	parent: FakeElement | null = null;
	rect = { width: 100, height: 50 };
	constructor(readonly ownerDocument: FakeDocument) {}
	getBoundingClientRect(): { width: number; height: number } {
		return this.rect;
	}
	remove(): void {
		if (this.parent) {
			this.parent.children = this.parent.children.filter(
				(c) => c !== this,
			);
			this.parent = null;
		}
	}
}

class FakeElement {
	children: FakeCanvas[] = [];
	constructor(readonly ownerDocument: FakeDocument) {}
	appendChild(child: FakeCanvas): void {
		child.parent = this;
		this.children.push(child);
	}
}

class FakeDocument {
	readonly defaultView: FakeWindow;
	constructor(dpr: number) {
		this.defaultView = new FakeWindow(dpr);
	}
	createElement(_tag: "canvas"): FakeCanvas {
		return new FakeCanvas(this);
	}
	container(): FakeElement {
		return new FakeElement(this);
	}
}

const makeViewport = (doc: FakeDocument): Viewport =>
	new Viewport(doc as unknown as Document);

describe("Viewport owning-window wiring", () => {
	test("attach sizes the backing store to the owning window's DPR", () => {
		FakeResizeObserver.observed.length = 0;
		const doc = new FakeDocument(2);
		const viewport = makeViewport(doc);
		const container = doc.container();

		viewport.attach(container as unknown as HTMLElement);

		expect(viewport.width).toBe(200);
		expect(viewport.height).toBe(100);
		const call = FakeResizeObserver.observed.at(-1)!;
		expect(call.target).toBe(container);
		expect(call.observer).toBeInstanceOf(FakeResizeObserver);
	});

	test("a second window's DPR drives sizing, not the first", () => {
		const hub = new FakeDocument(1);
		const satellite = new FakeDocument(3);
		const viewport = makeViewport(hub);

		viewport.attach(hub.container() as unknown as HTMLElement);
		expect(viewport.width).toBe(100);

		viewport.reattach(
			satellite.container() as unknown as HTMLElement,
		);
		expect(viewport.width).toBe(300);
	});

	test("reattach recreates the canvas in the destination document", () => {
		const hub = new FakeDocument(1);
		const satellite = new FakeDocument(1);
		const viewport = makeViewport(hub);
		const hubContainer = hub.container();

		viewport.attach(hubContainer as unknown as HTMLElement);
		const first = viewport.element as unknown as FakeCanvas;
		first.style.cssText = "outline: none;";
		first.className = "canvas-x";
		first.tabIndex = 0;

		const satContainer = satellite.container();
		viewport.reattach(satContainer as unknown as HTMLElement);
		const next = viewport.element as unknown as FakeCanvas;

		expect(next).not.toBe(first);
		expect(next.ownerDocument).toBe(satellite);
		expect(first.parent).toBeNull();
		expect(satContainer.children).toContain(next);
		expect(next.className).toBe("canvas-x");
		expect(next.style.cssText).toBe("outline: none;");
	});

	test("reattach adopts a supplied (pre-warmed) canvas instead of minting one", () => {
		const hub = new FakeDocument(1);
		const satellite = new FakeDocument(1);
		const viewport = makeViewport(hub);
		viewport.attach(hub.container() as unknown as HTMLElement);
		const old = viewport.element as unknown as FakeCanvas;
		old.style.cssText = "outline: none;";
		old.className = "canvas-y";

		const warmed = satellite.createElement("canvas");
		const satContainer = satellite.container();
		viewport.reattach(
			satContainer as unknown as HTMLElement,
			warmed as unknown as HTMLCanvasElement,
		);

		expect(viewport.element as unknown as FakeCanvas).toBe(warmed);
		expect(warmed.ownerDocument).toBe(satellite);
		expect(satContainer.children).toContain(warmed);
		expect(warmed.className).toBe("canvas-y");
		expect(warmed.style.cssText).toBe("outline: none;");
	});

	test("detach returned by attach removes only the canvas it mounted", () => {
		const hub = new FakeDocument(1);
		const satellite = new FakeDocument(1);
		const viewport = makeViewport(hub);

		const staleDetach = viewport.attach(
			hub.container() as unknown as HTMLElement,
		);
		const moved = viewport.element as unknown as FakeCanvas;

		const satContainer = satellite.container();
		viewport.reattach(satContainer as unknown as HTMLElement);
		const current = viewport.element as unknown as FakeCanvas;
		expect(current).not.toBe(moved);

		staleDetach();

		expect(satContainer.children).toContain(current);
	});
});
