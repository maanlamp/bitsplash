import { ReactComponent as ChipprSvg } from "assets/images/chippr.svg";
import Center from "layout/center";
import Column from "layout/column";
import Flex, {
	CrossAxisAlignment,
	MainAxisAlignment,
	Positioning,
	TextAlignment,
} from "layout/flex";
import { Gap, Padding } from "layout/layout";
import Row from "layout/row";
import { useLocale } from "lib/i18n";
import usePersistence, { Persistence } from "lib/persistence";
import Prefetch from "lib/prefetch";
import { route, Routes } from "lib/router";
import ErrorPage from "pages/error/error-page";
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Link } from "react-router-dom";
import "./reset.scss";
import "./theme.scss";

const App = () => {
	const { t } = useTranslation();
	const [lang, setLang] = useAppLanguage();
	const { locales } = useLocale();

	return (
		<>
			<Row
				as="header"
				gap={Gap.Huge}
				mainAxisAlignment={MainAxisAlignment.SpaceBetween}
				crossAxisAlignment={CrossAxisAlignment.Center}
				padding={Padding.Medium}
				positioning={Positioning.Sticky}
				style={{ top: 0, zIndex: 1, background: "white" }}>
				<Link to={route("home")}>{t("pages.home.title")}</Link>
				<Row gap={Gap.Medium} crossAxisAlignment={CrossAxisAlignment.Center}>
					<Link to={route("login")}>{t("pages.login.title")}</Link>
					<select
						defaultValue={lang}
						onChange={({ target: { value: lang } }) => setLang(lang)}>
						{Object.keys(locales).map(locale => (
							<option key={locale} value={locale}>
								{t(`languages.${locale}`)}
							</option>
						))}
					</select>
				</Row>
			</Row>
			<Flex as="main" grow>
				<Routes />
			</Flex>
			<Row
				as="footer"
				mainAxisAlignment={MainAxisAlignment.SpaceBetween}
				crossAxisAlignment={CrossAxisAlignment.Center}
				padding={Padding.Huge}>
				<a href="https://chippr.dev">
					<ChipprSvg />
				</a>
				<Column textAlignment={TextAlignment.End}>
					<p>{t("footer")}</p>
					<p>©️ Chippr {new Date().getUTCFullYear()}</p>
				</Column>
			</Row>
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
