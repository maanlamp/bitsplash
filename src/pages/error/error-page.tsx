import Center from "layout/center";
import { Padding } from "layout/layout";

type ErrorPageProps<T = unknown> = Readonly<{
	error: T;
}>;

const ErrorPage = <T = unknown,>({ error }: ErrorPageProps<T>) => (
	<Center
		as="pre"
		grow
		padding={Padding.Huge}
		style={{ background: "#B50100", color: "#F5FF89" }}>
		{(error as any).toString()}
	</Center>
);

export default ErrorPage;
