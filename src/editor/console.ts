const originalConsole: Partial<Console> = {
	log: console.log,
	warn: console.warn,
	error: console.error,
	info: console.info,
	debug: console.debug,
};

const listeners = new Set<Function>();

export type ConsoleEntry = Readonly<{
	level: keyof Console;
	args: any[];
	timestamp: Date;
}>;

export const subscribeConsole = (
	listener: (entry: ConsoleEntry) => any,
) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

const emit = (level: keyof Console, args: any[]) => {
	const entry: ConsoleEntry = {
		level,
		args,
		timestamp: new Date(),
	};

	listeners.forEach((listener) => listener(entry));
};

Object.keys(originalConsole).forEach((key) => {
	const level = key as keyof Console;
	console[level] = (...args: any[]) => {
		emit(level, args);
		(originalConsole[level] as any).apply(originalConsole, args);
	};
});
