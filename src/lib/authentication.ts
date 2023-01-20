import usePersistence from "lib/persistence";

type UseAuthenticationParams<Authentication, User> = Readonly<{
	register: (username: string, password: string) => Promise<void>;
	login: (
		username: string,
		password: string
	) => Promise<readonly [Authentication, User]>;
	logout: () => Promise<void>;
	refresh: (auth: Authentication) => Promise<Authentication>;
}>;

const makeUseAuthentication =
	<User, Authentication>({
		register: _register,
		login: _login,
		logout: _logout,
		refresh: _refresh,
	}: UseAuthenticationParams<Authentication, User>) =>
	() => {
		const [auth, setAuth] = usePersistence<Authentication>("authentication");
		const [user, setUser] = usePersistence<User>("user");

		const register = (...args: Parameters<typeof _register>) =>
			_register(...args);

		const login = (...args: Parameters<typeof _login>) =>
			_login(...args).then(([auth, user]) => {
				setAuth(auth);
				setUser(user);
				return [auth, user] as const;
			});

		const logout = (...args: Parameters<typeof _logout>) =>
			_logout(...args).then(() => {
				setAuth(undefined);
				setUser(undefined);
			});

		const refresh = (...args: Parameters<typeof _refresh>) =>
			_refresh?.(...args).then(auth => {
				setAuth(auth);
				return auth;
			});

		return { auth, user, login, logout, register, refresh };
	};

export default makeUseAuthentication;
