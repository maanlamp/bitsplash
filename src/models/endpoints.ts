import JSONPlaceholder from "models/json-placeholder";

type IO<I, O> = Readonly<{
	input: I;
	ouput: O;
}>;

type Nothing = Readonly<{}>;

type Endpoints = Readonly<{
	GET: {
		"https://jsonplaceholder.typicode.com/posts": JSONPlaceholder[];
		[
			url: `https://jsonplaceholder.typicode.com/posts/${number}`
		]: JSONPlaceholder;
	};
	POST: {
		"https://jsonplaceholder.typicode.com/posts": IO<
			JSONPlaceholder,
			JSONPlaceholder
		>;
	};
	PUT: {
		[url: `https://jsonplaceholder.typicode.com/posts/${number}`]: IO<
			JSONPlaceholder,
			JSONPlaceholder
		>;
	};
	PATCH: {
		[url: `https://jsonplaceholder.typicode.com/posts/${number}`]: IO<
			Partial<JSONPlaceholder>,
			JSONPlaceholder
		>;
	};
	DELETE: {
		[url: `https://jsonplaceholder.typicode.com/posts/${number}`]: Nothing;
	};
}>;

export default Endpoints;
