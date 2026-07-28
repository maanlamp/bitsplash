import Yoga, { Direction, type Node } from "yoga-layout";
import type { UiNode } from "../reconciler/ui-node";
import type { Style } from "../style/style";
import { applyLayoutStyle } from "../style/style-resolver";
import type { MeasureProvider } from "./measure-text";

const yogaOf = (node: UiNode): Node | undefined =>
	node.yoga as Node | undefined;

export class YogaBridge {
	private readonly measured = new WeakSet<UiNode>();

	constructor(private readonly measureProvider?: MeasureProvider) {}

	create(node: UiNode): void {
		const yoga = Yoga.Node.create();
		node.yoga = yoga;
		const measure = this.measureProvider?.(node);
		if (measure) {
			yoga.setMeasureFunc(measure);
			this.measured.add(node);
		}
	}

	/**
	 * Retires a node from layout: releases its yoga node and drops its
	 * `layoutRect`, so consumers that key off a rect (focus collection, hit
	 * testing, painting) stop seeing a node that is no longer in the tree.
	 */
	free(node: UiNode): void {
		node.layoutRect = undefined;
		const yoga = yogaOf(node);
		if (!yoga) {
			return;
		}
		const parent = yoga.getParent();
		if (parent) {
			parent.removeChild(yoga);
		}
		if (this.measured.has(node)) {
			yoga.unsetMeasureFunc();
			this.measured.delete(node);
		}
		yoga.free();
		node.yoga = undefined;
	}

	applyStyle(node: UiNode, style: Style): void {
		const yoga = yogaOf(node);
		if (!yoga) {
			return;
		}
		applyLayoutStyle(yoga, style);
		if (this.measured.has(node)) {
			yoga.markDirty();
		}
	}

	calculate(
		root: UiNode,
		availableWidth: number,
		availableHeight: number,
	): void {
		const yoga = yogaOf(root);
		if (!yoga) {
			return;
		}
		this.syncTree(root);
		yoga.calculateLayout(
			availableWidth,
			availableHeight,
			Direction.LTR,
		);
		this.writeRects(root, 0, 0);
	}

	private syncTree(node: UiNode): void {
		const yoga = yogaOf(node);
		if (!yoga) {
			return;
		}
		if (this.measured.has(node)) {
			yoga.markDirty();
		} else {
			this.syncChildren(node, yoga);
		}
		for (const child of node.children) {
			this.syncTree(child);
		}
	}

	private syncChildren(node: UiNode, yoga: Node): void {
		const desired: Node[] = [];
		for (const child of node.children) {
			const childYoga = yogaOf(child);
			if (childYoga) {
				desired.push(childYoga);
			}
		}
		let matches = yoga.getChildCount() === desired.length;
		if (matches) {
			for (let i = 0; i < desired.length; i++) {
				if (yoga.getChild(i) !== desired[i]) {
					matches = false;
					break;
				}
			}
		}
		if (matches) {
			return;
		}
		for (let i = yoga.getChildCount() - 1; i >= 0; i--) {
			yoga.removeChild(yoga.getChild(i));
		}
		for (let i = 0; i < desired.length; i++) {
			const child = desired[i]!;
			const parent = child.getParent();
			if (parent && parent !== yoga) {
				parent.removeChild(child);
			}
			yoga.insertChild(child, i);
		}
	}

	private writeRects(
		node: UiNode,
		offsetX: number,
		offsetY: number,
	): void {
		const yoga = yogaOf(node);
		if (!yoga) {
			return;
		}
		const x = offsetX + yoga.getComputedLeft();
		const y = offsetY + yoga.getComputedTop();
		node.layoutRect = {
			x,
			y,
			w: yoga.getComputedWidth(),
			h: yoga.getComputedHeight(),
		};
		for (const child of node.children) {
			this.writeRects(child, x, y);
		}
	}
}
