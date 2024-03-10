export const log = <T>(value: T) => {
	console.log(value);
	return value;
};

export const chunk =
	(n: number) =>
	<T>(target: ReadonlyArray<T>): ReadonlyArray<ReadonlyArray<T>> => {
		const chunks: T[][] = [];
		for (let i = 0; i < target.length; i++) {
			if (i % n === 0) {
				chunks.push([]);
			}
			chunks.at(-1)!.push(target[i]);
		}
		return chunks;
	};

export const omit =
	(keys: string | ReadonlyArray<string>) => (target: Record<string, any>) => {
		const allKeys = [keys].flat();
		return Object.fromEntries(
			Object.entries(target).filter(([k]) => allKeys.includes(k))
		);
	};
