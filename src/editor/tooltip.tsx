import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import controls from "./styles/controls.module.scss";

export const TooltipProvider = BaseTooltip.Provider;

const Tooltip = ({
	label,
	shortcut,
	children,
}: Readonly<{
	label: ReactNode;
	shortcut?: string;
	children: ReactElement;
}>) => (
	<BaseTooltip.Root>
		<BaseTooltip.Trigger render={children} />
		<BaseTooltip.Portal>
			<BaseTooltip.Positioner sideOffset={8}>
				<BaseTooltip.Popup className={controls.tooltip}>
					<span>{label}</span>
					{shortcut ? (
						<kbd className={controls.kbd}>{shortcut}</kbd>
					) : null}
				</BaseTooltip.Popup>
			</BaseTooltip.Positioner>
		</BaseTooltip.Portal>
	</BaseTooltip.Root>
);

export default Tooltip;
