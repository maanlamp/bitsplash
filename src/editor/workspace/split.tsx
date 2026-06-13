import { type ReactNode, useState } from "react";
import { adjustSizes, type SplitDirection } from "./layout";
import SplitContainer from "./split-container";

const loadSizes = (
	storageKey: string | undefined,
	count: number,
): ReadonlyArray<number> | null => {
	if (!storageKey) {
		return null;
	}
	try {
		const raw = localStorage.getItem(storageKey);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as unknown;
		if (
			Array.isArray(parsed) &&
			parsed.length === count &&
			parsed.every((value) => typeof value === "number")
		) {
			return parsed as ReadonlyArray<number>;
		}
	} catch {
		return null;
	}
	return null;
};

const saveSizes = (
	storageKey: string | undefined,
	sizes: ReadonlyArray<number>,
): void => {
	if (!storageKey) {
		return;
	}
	try {
		localStorage.setItem(storageKey, JSON.stringify(sizes));
	} catch (error) {
		void error;
	}
};

const Split = ({
	direction,
	initial,
	storageKey,
	children,
}: Readonly<{
	direction: SplitDirection;
	initial: ReadonlyArray<number>;
	storageKey?: string;
	children: ReadonlyArray<ReactNode>;
}>) => {
	const [sizes, setSizes] = useState<ReadonlyArray<number>>(
		() => loadSizes(storageKey, initial.length) ?? initial,
	);

	const onResize = (dividerIndex: number, delta: number) => {
		setSizes((prev) => {
			const next = adjustSizes(prev, dividerIndex, delta);
			saveSizes(storageKey, next);
			return next;
		});
	};

	return (
		<SplitContainer
			direction={direction}
			sizes={sizes}
			onResize={onResize}
		>
			{children}
		</SplitContainer>
	);
};

export default Split;
