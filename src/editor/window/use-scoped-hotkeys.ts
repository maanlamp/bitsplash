import type { DependencyList, RefCallback } from "react";
import {
	type HotkeyCallback,
	type Keys,
	type Options,
	useHotkeys,
} from "react-hotkeys-hook";
import { useWindowDocument } from "./window-context";

/**
 * The overloaded third/fourth argument of `useHotkeys`: either an
 * {@link Options} object or a `useCallback`-style dependency array. Mirrors
 * react-hotkeys-hook's own internal `OptionsOrDependencyArray`, which the
 * package does not export.
 */
type OptionsOrDependencyArray = Options | DependencyList;

/**
 * Narrows the overloaded argument to a dependency array. Written as a type
 * guard because `Array.isArray` alone does not narrow a `ReadonlyArray` out of
 * the false branch, which is what leaves an {@link Options} object behind.
 */
const isDependencyArray = (
	value: OptionsOrDependencyArray | undefined,
): value is DependencyList => Array.isArray(value);

/**
 * Splits the overloaded `(options?, dependencies?)` argument pair into a
 * normalized `[options, dependencies]` and injects the owning window's
 * `document` into the options. react-hotkeys-hook binds its keydown/keyup
 * listeners to `options.document ?? document`, so this is what scopes a hotkey
 * to the window it was registered in rather than the main realm. The injected
 * `document` always wins, guaranteeing the scope regardless of what the caller
 * passed. Exported for headless unit testing; prefer {@link useScopedHotkeys}.
 */
export const injectDocument = (
	doc: Document,
	options?: OptionsOrDependencyArray,
	dependencies?: OptionsOrDependencyArray,
): readonly [Options, DependencyList | undefined] => {
	if (isDependencyArray(options)) {
		const opts = isDependencyArray(dependencies)
			? undefined
			: dependencies;
		return [{ ...opts, document: doc }, options];
	}
	const deps = isDependencyArray(dependencies)
		? dependencies
		: undefined;
	return [{ ...options, document: doc }, deps];
};

/**
 * Drop-in replacement for react-hotkeys-hook's `useHotkeys` that binds the
 * hotkey to the owning window's `document` instead of the main realm's global
 * `document`. In the multi-window editor each OS window has its own
 * `document`; the default `useHotkeys` listens on the main document, so a
 * hotkey pressed in a popout would never fire. This wrapper resolves the
 * document via {@link useWindowDocument} and injects it as the `document`
 * option, leaving every other option and the dependency array untouched.
 *
 * The signature matches `useHotkeys(keys, callback, options?, dependencies?)`
 * exactly, so migration is a mechanical import + rename.
 *
 * @example
 * useScopedHotkeys("mod+z", () => history.undo(), { enabled }, [history]);
 */
export const useScopedHotkeys = <T extends HTMLElement = HTMLElement>(
	keys: Keys,
	callback: HotkeyCallback,
	options?: OptionsOrDependencyArray,
	dependencies?: OptionsOrDependencyArray,
): RefCallback<T | null> => {
	const doc = useWindowDocument();
	const [scopedOptions, scopedDependencies] = injectDocument(
		doc,
		options,
		dependencies,
	);
	return useHotkeys<T>(
		keys,
		callback,
		scopedOptions,
		scopedDependencies,
	);
};
