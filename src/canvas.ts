export const canvas = () => {
	const context = document.createElement("canvas").getContext("2d");
	if (!context) throw new Error("Could not get 2d context");
	return context;
};
