export type TimelineView = Readonly<{
	unitToX: (unit: number) => number;
	xToUnit: (x: number) => number;
	pxPerUnit: number;
	offset: number;
	width: number;
	height: number;
}>;
