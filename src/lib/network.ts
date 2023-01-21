import makeUseAuthentication from "lib/authentication";
import { ValueOf } from "lib/utils";
import Endpoints from "models/endpoints";

type DatalessRequestParams = Readonly<{
	url: string;
	method: "GET" | "DELETE";
	decode: keyof typeof decoders;
	authorisation?: string;
}>;

type DataRequestParams<T> = Readonly<{
	url: string;
	method: Exclude<keyof Endpoints, DatalessRequestParams["method"]>;
	body: T;
	encode: keyof typeof encoders;
	decode: keyof typeof decoders;
	authorisation?: string;
}>;

const isGetRequest = <T>(
	request: RequestParams<T>
): request is DatalessRequestParams =>
	["GET", "DELETE"].includes(request.method);

type RequestParams<T> = DatalessRequestParams | DataRequestParams<T>;

const supportedMimeTypes = {
	json: "application/json",
	formData: "multipart/form-data",
};

const headersWillNotBeAutomaticallyGeneratedByFetchApi = (
	mime: ValueOf<typeof supportedMimeTypes>
) =>
	![
		// For multipart forms, the fetch API will automatically insert
		// a "form-boundary" into the data and header.
		"multipart/form-data",

		// TODO: More mimetypes?
	].includes(mime);

const request = async <I extends {}, O>(params: RequestParams<I>) => {
	const headers: Record<string, string> = {
		Accept: supportedMimeTypes[params.decode],
	};

	if (params.authorisation)
		headers["Authorization"] = `Bearer ${params.authorisation}`;

	const options: RequestInit = {
		method: params.method,
	};

	if (!isGetRequest(params)) {
		const encoder = encoders[params.encode];
		options.body = encoder(params.body);
		if (headersWillNotBeAutomaticallyGeneratedByFetchApi(params.encode))
			headers["Content-Type"] = supportedMimeTypes[params.encode];
	}

	options.headers = headers;

	const response = await fetch(params.url, options);

	if (!response.ok) throw response;
	return decoders[params.decode](response) as Promise<O>;
};

const encoders = {
	json: (data: Record<any, any>) => JSON.stringify(data),
	formData: (data: Record<any, any>) => {
		const formData = new FormData();
		Object.entries(data).forEach(([key, value]) => formData.set(key, value));
		return formData;
	},
};

const decoders = {
	json: <T>(data: Response) => data.json() as Promise<T>,
};

type RequestOptions = Readonly<{
	encode: keyof typeof encoders;
	decode: keyof typeof decoders;
	authorisation: string;
}>;

export const get = <URL extends keyof Endpoints["GET"]>(
	url: URL,
	options?: Partial<RequestOptions>
): Promise<Endpoints["GET"][URL]> =>
	request({
		url,
		method: "GET",
		decode: options?.decode ?? "json",
		authorisation: options?.authorisation,
	});

export const post = <
	URL extends keyof Endpoints["POST"],
	T extends Endpoints["POST"][URL]
>(
	url: URL,
	body: T["input"],
	options?: Partial<RequestOptions>
): Promise<T["ouput"]> =>
	request({
		url,
		body,
		method: "POST",
		encode: options?.encode ?? "json",
		decode: options?.decode ?? "json",
		authorisation: options?.authorisation,
	});

export const put = <
	URL extends keyof Endpoints["PUT"],
	T extends Endpoints["PUT"][URL]
>(
	url: URL,
	body: T["input"],
	options?: Partial<RequestOptions>
): Promise<T["ouput"]> =>
	request({
		url,
		body,
		method: "PUT",
		encode: options?.encode ?? "json",
		decode: options?.decode ?? "json",
		authorisation: options?.authorisation,
	});

export const patch = <
	URL extends keyof Endpoints["PATCH"],
	T extends Endpoints["PATCH"][URL]
>(
	url: URL,
	body: T["input"],
	options?: Partial<RequestOptions>
): Promise<T["ouput"]> =>
	request({
		url,
		body,
		method: "PATCH",
		encode: options?.encode ?? "json",
		decode: options?.decode ?? "json",
		authorisation: options?.authorisation,
	});

export const _delete = <URL extends keyof Endpoints["DELETE"]>(
	url: URL,
	options?: Partial<RequestOptions>
): Promise<Endpoints["DELETE"][URL]> =>
	request({
		url,
		method: "DELETE",
		decode: options?.decode ?? "json",
		authorisation: options?.authorisation,
	});

/** A function that creates a hook which exposes authenticated versions of all network functions.
 *
 * @see makeUseAuthentication Make sure to provide the `useAuth` hook you created from `makeUseAuthentication`.
 */
export const makeUseNetwork = <
	User,
	Authentication,
	UseAuth extends ReturnType<typeof makeUseAuthentication<User, Authentication>>
>(
	useAuth: UseAuth,
	validate: (auth: Authentication) => boolean
) => {
	let refreshPromise;

	const useNetwork = () => {
		const { auth, refresh } = useAuth();

		const refreshAuthIfNecessaryBefore = async <
			F extends (...args: any[]) => Promise<any>,
			Args extends Parameters<F>
		>(
			f: F,
			args: Args
		) => {
			if (!auth) return f(...args);
			const valid = validate(auth);
			if (valid) return f(...args);
			await (refreshPromise ??= refresh(auth).then(() => {
				refreshPromise = undefined;
			}));
			return f(...args);
		};

		const authorisedMethods = Object.fromEntries(
			Object.entries({ get, post, put, patch, _delete }).map(([k, f]) => [
				k,
				<Args extends Parameters<typeof f>>(...args: Args) =>
					refreshAuthIfNecessaryBefore(f as any, args),
			])
		);

		return authorisedMethods;
	};

	return useNetwork;
};
