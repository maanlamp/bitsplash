import { createContext, useContext } from "react";
import type { TimelineView } from "./timeline-view";

export const TimelineViewContext = createContext<TimelineView | null>(
	null,
);

export const useTimelineView = (): TimelineView => {
	const view = useContext(TimelineViewContext);
	if (!view) {
		throw new Error(
			"useTimelineView must be used inside <Timeline>.",
		);
	}
	return view;
};
