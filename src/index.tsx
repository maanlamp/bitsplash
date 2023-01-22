import Center from "layout/center";
import Flex from "layout/flex";
import { useLocale } from "lib/i18n";
import usePersistence, { Persistence } from "lib/persistence";
import Prefetch from "lib/prefetch";
import { Routes } from "lib/router";
import ErrorPage from "pages/error/error-page";
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { BrowserRouter } from "react-router-dom";
import "./reset.scss";
import "./theme.scss";

const App = () => {
	const { t } = useTranslation();
	const [lang, setLang] = useAppLanguage();
	const { locales } = useLocale();

	return (
		<>
			<Flex as="main" grow>
				<Routes />
			</Flex>
		</>
	);
};

const useAppLanguage = () => {
	const { i18n } = useTranslation();
	const [lang, setLang] = usePersistence("lang", i18n.resolvedLanguage);

	useEffect(() => {
		i18n.changeLanguage(lang);
	}, [lang]);

	return [lang, setLang] as const;
};

ReactDOM.render(
	<React.StrictMode>
		<BrowserRouter>
			<Persistence>
				<Prefetch
					loading={
						<Center grow>
							<span>Loading...</span>
						</Center>
					}
					error={error => <ErrorPage error={error} />}>
					<App />
				</Prefetch>
			</Persistence>
		</BrowserRouter>
	</React.StrictMode>,
	document.getElementById("root")
);
