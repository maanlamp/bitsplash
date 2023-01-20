import { formatRelative } from "date-fns";
import Column from "layout/column";
import Flex, { CrossAxisAlignment, FlexDirection } from "layout/flex";
import { Gap, Padding } from "layout/layout";
import Row from "layout/row";
import { useLocale } from "lib/i18n";
import { getArticle } from "lib/mock-api";
import { Responsive, ScreenSize, useBreakpoints } from "lib/responsiveness";
import suspend from "lib/suspend";
import { capitalise } from "lib/utils";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

// ℹ️ Note how this page is completely responsive without complicated CSS.
// You can check out the little CSS that is declared down here
// vvvv
import "./post-detail-page.scss";

type PostDetailPageProps = Readonly<{}>;

const PostDetailPage = ({}: PostDetailPageProps) => {
	const { postId } = useParams<{ postId: string }>();
	const { t } = useTranslation();
	const { locale } = useLocale();
	const breakpoints = useBreakpoints();

	const post = suspend(() => getArticle(postId!), postId);

	const breakpoint = ScreenSize.M;

	const authors = (
		<Column gap={Gap.Small}>
			<i>{t("pages.postDetail.authors")}</i>
			<Flex
				wrap
				gap={Gap.Medium}
				direction={
					breakpoints[">="](breakpoint)
						? FlexDirection.Column
						: FlexDirection.Row
				}>
				{post.authors.map(author => (
					<Row
						classes="author"
						key={author.name}
						crossAxisAlignment={CrossAxisAlignment.Center}
						gap={Gap.Small}>
						<Flex>
							<img src={author.img} alt="" />
						</Flex>
						<Column>
							<span className="name">{author.name}</span>
							<Link className="handle" to="#">
								{author.handle}
							</Link>
						</Column>
					</Row>
				))}
			</Flex>
		</Column>
	);

	return (
		<Responsive>
			{query => (
				<Flex
					grow
					classes="post-detail-page"
					direction={
						query["<"](breakpoint) ? FlexDirection.Column : FlexDirection.Row
					}
					crossAxisAlignment={CrossAxisAlignment.Start}>
					<Column gap={Gap.Large} padding={Padding.Huge}>
						<Flex
							classes="hero"
							gap={query["<"](breakpoint) ? Gap.Medium : Gap.Large}
							direction={
								query["<"](breakpoint)
									? FlexDirection.Column
									: FlexDirection.Row
							}
							crossAxisAlignment={
								query["<"](breakpoint)
									? CrossAxisAlignment.Stretch
									: CrossAxisAlignment.End
							}>
							<Flex>
								<img src={post.img} />
							</Flex>
							<h1>{capitalise(post.title)}</h1>
						</Flex>
						<span>
							{t("pages.postDetail.lastUpdated")}{" "}
							<time dateTime={post.lastUpdatedAt.toISOString()}>
								{formatRelative(post.lastUpdatedAt, new Date(), { locale })}
							</time>
						</span>
						<Row
							wrap
							classes="tags"
							gap={Gap.Small}
							crossAxisAlignment={CrossAxisAlignment.Center}>
							{post.tags.map(tag => (
								<Row
									key={tag}
									classes="tag"
									padding={{
										vertical: Padding.Small,
										horizontal: Padding.Medium,
									}}>
									{tag}
								</Row>
							))}
						</Row>
						<Responsive>
							{matches => matches["<"](breakpoint) && authors}
						</Responsive>
						<Column gap={Gap.Large}>
							<p className="intro text-medium">{capitalise(post.excerpt)}</p>
							{post.content.map((paragraph, i) => (
								<p key={i}>{paragraph}</p>
							))}
						</Column>
					</Column>
					{query[">="](breakpoint) && (
						<Column
							padding={Padding.Huge}
							style={{ position: "sticky", top: 0 }}>
							{authors}
						</Column>
					)}
				</Flex>
			)}
		</Responsive>
	);
};

export default PostDetailPage;
