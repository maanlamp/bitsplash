export const toSentenceCase = (input: string): string => {
	const words = input
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.split(/\s+/)
		.map((word) => word.toLowerCase());

	const sentence = words.join(" ");

	return sentence.charAt(0).toUpperCase() + sentence.slice(1);
};
