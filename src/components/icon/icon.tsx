type IconProps = Readonly<{
	svg: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
	size?: number;
}>;

const Icon = ({ svg: Svg, size = 0.725 }: IconProps) => {
	//

	return (
		<Svg
			className="icon flex"
			style={{ width: `${size}em`, height: `${size}em` }}
		/>
	);
};

export default Icon;
