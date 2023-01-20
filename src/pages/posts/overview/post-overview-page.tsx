import { ReactComponent as ArrowIcon } from "assets/images/angle-right.svg";
import Icon from "components/icon/icon";
import Column from "layout/column";
import { CrossAxisAlignment, Positioning } from "layout/flex";
import { Gap, Padding } from "layout/layout";
import Row from "layout/row";
import { getArticles } from "lib/mock-api";
import { route } from "lib/router";
import suspend from "lib/suspend";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import "./post-overview-page.scss";

const PostOverviewPage = () => {
	const { t } = useTranslation();
	const posts = suspend(getArticles);

	return (
		<Column
			grow
			gap={Gap.Medium}
			padding={Padding.Huge}
			classes="post-overview-page">
			<Column gap={Gap.Tiny}>
				{posts.map(post => (
					<Link to={route("postDetail", { postId: post.id })} key={post.id}>
						<Row positioning={Positioning.Relative}>
							<img src={post.img} className="position-absolute" />
							<Column
								gap={Gap.Medium}
								padding={{
									top: Padding.Huge,
									horizontal: Padding.Medium,
									bottom: Padding.Medium,
								}}
								positioning={Positioning.Relative}>
								<h2>{post.title}</h2>
								<p>{post.excerpt}</p>
								<Row
									gap={Gap.Small}
									crossAxisAlignment={CrossAxisAlignment.Baseline}>
									<span>{t("pages.postOverview.readMore")}</span>
									<Icon svg={ArrowIcon} />
								</Row>
							</Column>
						</Row>
					</Link>
				))}
			</Column>
		</Column>
	);
};

export default PostOverviewPage;
