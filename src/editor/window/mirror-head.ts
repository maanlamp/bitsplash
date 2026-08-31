/**
 * Mirror the main document's `<head>` stylesheets into a satellite document and
 * keep them in sync (the VS Code auxiliary-window recipe). The satellite runs no
 * app JS and Vite injects styles only into the main document, so a popout has no
 * CSS until the main `<head>`'s `<style>`/`<link rel=stylesheet>` nodes are
 * cloned across. A {@link MutationObserver} propagates later additions,
 * removals, and — crucially for Vite HMR — in-place `<style>` text updates.
 *
 * @returns a disposer that stops observing and removes the cloned nodes.
 */
const isStyleNode = (node: Node): boolean =>
	node.nodeName === "STYLE" ||
	(node.nodeName === "LINK" &&
		(node as HTMLLinkElement).rel === "stylesheet");

export const mirrorHead = (childDoc: Document): (() => void) => {
	const srcHead = document.head;
	const dstHead = childDoc.head;
	const clones = new Map<Node, Node>();

	const track = (node: Node): void => {
		if (!isStyleNode(node) || clones.has(node)) {
			return;
		}
		const clone = node.cloneNode(true);
		dstHead.appendChild(clone);
		clones.set(node, clone);
	};

	const untrack = (node: Node): void => {
		const clone = clones.get(node);
		if (clone) {
			clone.parentNode?.removeChild(clone);
			clones.delete(node);
		}
	};

	const resync = (): void => {
		for (const [source, clone] of clones) {
			if (
				source.nodeName === "STYLE" &&
				clone.textContent !== source.textContent
			) {
				clone.textContent = source.textContent;
			}
		}
	};

	for (const node of Array.from(srcHead.childNodes)) {
		track(node);
	}

	const observer = new MutationObserver((records) => {
		for (const record of records) {
			for (const node of Array.from(record.addedNodes)) {
				track(node);
			}
			for (const node of Array.from(record.removedNodes)) {
				untrack(node);
			}
		}
		resync();
	});
	observer.observe(srcHead, {
		childList: true,
		subtree: true,
		characterData: true,
	});

	return () => {
		observer.disconnect();
		for (const clone of clones.values()) {
			clone.parentNode?.removeChild(clone);
		}
		clones.clear();
	};
};
