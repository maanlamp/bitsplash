type IO<I, O> = Readonly<{
	input: I;
	ouput: O;
}>;

type Nothing = Readonly<{}>;

type Endpoints = Readonly<{
	GET: {};
	POST: {};
	PUT: {};
	PATCH: {};
	DELETE: {};
}>;

export default Endpoints;
