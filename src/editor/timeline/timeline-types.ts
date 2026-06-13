export type TimelineClip = Readonly<{
	id: string;
	start: number;
	duration: number;
	color?: string;
}>;

export type TimelineTrack = Readonly<{
	id: string;
	name: string;
	height: number;
	color: string;
	clips: ReadonlyArray<TimelineClip>;
}>;

export type ClipChangeMode = "move" | "trim-start" | "trim-end";

export type ClipChange = Readonly<{
	start: number;
	duration: number;
}>;
