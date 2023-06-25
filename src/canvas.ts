export type Size = { width: number; height: number };

export const canvas = (size: Size) => {
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) throw new Error(`Could not get context`);
	canvas.width = size.width;
	canvas.height = size.height;
	return context;
};
