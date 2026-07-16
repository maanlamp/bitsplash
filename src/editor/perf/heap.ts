type MemoryInfo = Readonly<{ usedJSHeapSize: number }>;
type PerformanceWithMemory = Performance & { memory?: MemoryInfo };

/**
 * Used JS heap size in bytes via the non-standard `performance.memory`, or `0`
 * where unavailable. A whole-process figure (not per-world), quantized and
 * sawtoothing with GC — a rough trend, not a precise number.
 */
export const usedHeapBytes = (): number =>
	(performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? 0;
