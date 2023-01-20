import Button from "components/button/button";
import Column from "layout/column";
import { CrossAxisAlignment, MainAxisAlignment } from "layout/flex";
import { Gap, Padding } from "layout/layout";
import makeUseAuthentication from "lib/authentication";
import { wait } from "lib/utils";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

const fakeId = () =>
	[...Array(32).keys()]
		.map(() => Math.round(Math.random() * 16).toString(16))
		.join("");

const fakeUser = { id: fakeId() };

const roles = ["User", "Admin"];

const fakeAuthentication = {
	token: fakeId(),
	roles: roles[Math.round(Math.random() * roles.length)],
	username: "username",
};

const useAuth = makeUseAuthentication({
	register: () => wait(Math.random() * 1750 + 250),
	login: (username, password) =>
		wait(Math.random() * 1750 + 250).then(
			() => [fakeAuthentication, fakeUser] as const
		),
	logout: () => Promise.resolve(),
	refresh: () =>
		wait(Math.random() * 1750 + 250).then(() => fakeAuthentication),
});

const LoginPage = () => {
	const { t } = useTranslation();
	const { auth, login, logout } = useAuth();
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSubmitting(true);

		const formData = new FormData(event.currentTarget);
		try {
			await login(
				formData.get("username")!.toString(),
				formData.get("password")!.toString()
			);
		} catch (err: any) {
			if (err instanceof Error) throw err;
			// Handle server errors here
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Column
			grow
			mainAxisAlignment={MainAxisAlignment.Center}
			crossAxisAlignment={CrossAxisAlignment.Center}
			gap={Gap.Large}
			padding={{ vertical: Padding.Huge }}>
			<h1>{t("pages.login.title")}</h1>
			{auth ? (
				<Button onClick={logout} variant="primary">
					{t("pages.login.logout")}
				</Button>
			) : (
				<Column as="form" onSubmit={handleSubmit} gap={Gap.Medium}>
					<Column gap={Gap.Small}>
						<label htmlFor="username">{t("pages.login.username")}</label>
						<input
							required
							disabled={submitting}
							autoFocus
							type="email"
							name="username"
							id="username"
						/>
					</Column>
					<Column gap={Gap.Small}>
						<label htmlFor="password">{t("pages.login.password")}</label>
						<input
							required
							disabled={submitting}
							type="password"
							name="password"
							id="password"
						/>
					</Column>
					<Button type="submit" busy={submitting} variant="primary">
						{t("pages.login.login")}
					</Button>
				</Column>
			)}
		</Column>
	);
};

export default LoginPage;
