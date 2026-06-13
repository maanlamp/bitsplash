import { ContextMenu } from "@base-ui/react/context-menu";
import {
	FileAudioIcon,
	FileImageIcon,
	SquaresFourIcon,
} from "@phosphor-icons/react";
import classNames from "classnames";
import type { ReactNode } from "react";
import surface from "./styles/surface.module.scss";

export type AssetCreateActions = Readonly<{
	onNewSprite: () => void;
	onNewTileset: () => void;
	onNewAudio: () => void;
}>;

const Popup = ({ children }: Readonly<{ children: ReactNode }>) => (
	<ContextMenu.Portal>
		<ContextMenu.Positioner>
			<ContextMenu.Popup
				className={classNames(surface.surface, surface.menu)}
			>
				{children}
			</ContextMenu.Popup>
		</ContextMenu.Positioner>
	</ContextMenu.Portal>
);

export const AssetContextMenu = ({
	actions,
	extra,
	children,
}: Readonly<{
	actions: AssetCreateActions;
	extra?: ReactNode;
	children: ReactNode;
}>) => (
	<ContextMenu.Root>
		<ContextMenu.Trigger
			className={surface.contextTrigger}
			onMouseDown={(e) => {
				if (e.button === 2) {
					e.preventDefault();
				}
			}}
		>
			{children}
		</ContextMenu.Trigger>
		<Popup>
			<ContextMenu.Item
				className={surface.item}
				onClick={actions.onNewSprite}
			>
				<FileImageIcon className={surface.itemIcon} weight="bold" />
				New sprite
			</ContextMenu.Item>
			<ContextMenu.Item
				className={surface.item}
				onClick={actions.onNewTileset}
			>
				<SquaresFourIcon className={surface.itemIcon} weight="bold" />
				New tileset
			</ContextMenu.Item>
			<ContextMenu.Item
				className={surface.item}
				onClick={actions.onNewAudio}
			>
				<FileAudioIcon className={surface.itemIcon} weight="bold" />
				New audio
			</ContextMenu.Item>
			{extra && (
				<>
					<ContextMenu.Separator className={surface.divider} />
					{extra}
				</>
			)}
		</Popup>
	</ContextMenu.Root>
);
