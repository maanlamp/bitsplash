import cursor from "./styles/cursor.module.scss";

export type CursorMode = "default" | "grab" | "hidden";

export const setCursorMode = (
	element: HTMLElement,
	mode: CursorMode,
): void => {
	element.classList.toggle(cursor.grab!, mode === "grab");
	element.classList.toggle(cursor.hidden!, mode === "hidden");
};
