import { Component, ReactNode, Suspense } from "react";

type LoadingState = Readonly<{
	progress: number;
}>;

type PrefetchProps = Readonly<{
	loading: ((state?: LoadingState) => ReactNode) | ReactNode;
	error: (<T extends {}>(error: T) => ReactNode) | ReactNode;
	children: ReactNode;
}>;

type PrefetchState<T extends {}> = Readonly<{
	error?: T;
}>;

/** When working with asynchronous data, you will need to handle empty, loading and error states. This component captures any _suspended_ values or errors, and shows a _loading_ or _error_ state respectively. Works really nice in combination with suspend.
 *
 * Don't forget to think about what to show when your data is empty!
 */
class Prefetch<T extends {}> extends Component<
	PrefetchProps,
	PrefetchState<T>
> {
	static getDerivedStateFromError<T extends {}>(error: T) {
		return { error };
	}

	state: PrefetchState<T> = {};

	render() {
		return this.state.error ? (
			typeof this.props.error === "function" ? (
				this.props.error(this.state.error)
			) : (
				this.props.error
			)
		) : (
			// TODO: Allow suspense to report progress in `loading`.
			<Suspense
				fallback={
					typeof this.props.loading === "function"
						? this.props.loading()
						: this.props.loading
				}>
				{this.props.children}
			</Suspense>
		);
	}
}

export default Prefetch;
