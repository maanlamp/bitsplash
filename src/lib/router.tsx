import { diceCoefficient } from "dice-coefficient";
import React from "react";
import { Route, Routes as RouterRoutes } from "react-router-dom";

// TODO: Upgrade to new react router to use native nested routes
// TODO: Find out how to type as flat Routes while preserving key types.
const flatten = (routes: Routes, root: string = ""): Routes =>
	Object.fromEntries(
		Object.entries(routes).flatMap(([key, route]) => [
			[key, { ...route, path: `${root}/${route.path}` }],
			...(route.subroutes
				? Object.entries(flatten(route.subroutes, `/${route.path}`))
				: []),
		])
	);

type Routes = Record<string, Route>;

type Route = Readonly<{
	path: string;
	component: React.LazyExoticComponent<any>;
	authorised?: () => boolean;
	subroutes?: Routes;
}>;

/** Define your routes as an entry in this object. Types should be self-explanatory. */
export const routes = flatten({
	home: {
		path: "",
		component: React.lazy(
			() => import("pages/posts/overview/post-overview-page")
		),
	},
	postDetail: {
		path: ":postId",
		component: React.lazy(() => import("pages/posts/detail/post-detail-page")),
	},
	login: {
		path: "login",
		component: React.lazy(() => import("pages/login/login-page")),
	},
});

const NotFoundPage = React.lazy(() => import("pages/not-found/not-found-page"));

export const Routes = () => (
	<RouterRoutes>
		{Object.entries(routes).map(([key, route]) => (
			<Route key={key} path={route.path} element={<route.component />} />
		))}
		<Route path="*" element={<NotFoundPage />} />
	</RouterRoutes>
);

/** Get a route by its key, to prevent typos and to get
 * type errors when a route changes.
 */
export const route = (
	// TODO: Find out how to get a union of all keys instead of `string`.
	key: keyof typeof routes,
	params?: Record<string, { toString(...args: any[]): string }>
) => {
	if (!routes[key]) {
		const alternatives = Object.keys(routes)
			.map(route => [route, diceCoefficient(route, key)])
			.filter(([, dice]) => dice >= 0.66)
			.map(([route]) => route)
			.slice(0, 3)
			.join("\n\t- ");
		throw new Error(
			`Unknown route "${key}".` +
				(alternatives.length
					? ` Maybe you meant one of the following:\n\t- ${alternatives}`
					: "")
		);
	}

	return routes[key].path.replace(
		/:[^\/]+/g,
		match => params?.[match.slice(1)]?.toString() ?? match
	);
};
