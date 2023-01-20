import Column from "layout/column";
import { CrossAxisAlignment } from "layout/flex";
import { route } from "lib/router";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

type NotFoundPageProps = Readonly<{}>;

const NotFoundPage = ({}: NotFoundPageProps) => {
	const location = useLocation();
	const { t } = useTranslation();

	return (
		<Column grow crossAxisAlignment={CrossAxisAlignment.Center}>
			<h1>
				404: "{location.pathname}" {t("pages.notFound.notFound")}
			</h1>
			<Link to={route("home")}>{t("pages.notFound.goHome")}</Link>
		</Column>
	);
};

export default NotFoundPage;
