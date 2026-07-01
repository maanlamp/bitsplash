import parchmentUrl from "../content/assets/parchment.9slice.png?url";

const DEFAULT = parchmentUrl;

const panels: Record<string, string> = {
	parchment: parchmentUrl,
};

export const panelForTag = (name: string | undefined): string =>
	(name ? panels[name] : undefined) ?? DEFAULT;
