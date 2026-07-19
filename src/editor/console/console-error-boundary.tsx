import { Component, type ReactNode } from "react";

/**
 * Isolates a single console row's rendering: if react-inspector (or any child)
 * throws while rendering one logged value, only that row degrades to a fallback
 * instead of blanking the whole panel. Reset keying is by the row's id upstream,
 * so a folded/replaced entry re-mounts a fresh boundary.
 */
export class ConsoleErrorBoundary extends Component<
	Readonly<{ children: ReactNode; fallback: ReactNode }>,
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true };
	}

	render(): ReactNode {
		return this.state.failed
			? this.props.fallback
			: this.props.children;
	}
}
