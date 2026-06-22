import { Autocomplete } from "@base-ui/react/autocomplete";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Dialog } from "@base-ui/react/dialog";
import {
	CopyIcon,
	MinusCircleIcon,
	PlusCircleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import classNames from "classnames";
import type { ReactNode } from "react";
import type { ECS, EntityId } from "../engine/ecs";
import {
	componentClass,
	registeredComponents,
	serializableTypeName,
} from "../engine/serialization/registry";
import type { World } from "../engine/world";
import surface from "./styles/surface.module.scss";

import {
	addComponent,
	deleteEntity,
	duplicateEntity,
	removeComponent,
} from "./commands";
import type { History } from "./history";

export type MenuDeps = Readonly<{
	ecs: ECS;
	world: World;
	history: History;
	requestAddComponent: (entity: EntityId) => void;
	select: (entity: EntityId | null) => void;
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

const EntityItems = ({
	entity,
	deps,
}: Readonly<{ entity: EntityId; deps: MenuDeps }>) => {
	const { ecs, world, history, requestAddComponent, select } = deps;
	const attached = ecs
		.componentsOf(entity)
		.map((c) => ({ component: c, name: serializableTypeName(c) }))
		.filter(
			(c): c is { component: object; name: string } =>
				c.name !== undefined,
		);
	return (
		<>
			<ContextMenu.Item
				className={surface.item}
				onClick={() => requestAddComponent(entity)}
			>
				<PlusCircleIcon className={surface.itemIcon} weight="bold" />
				Add component…
			</ContextMenu.Item>
			<ContextMenu.Item
				className={surface.item}
				onClick={() => {
					const id = duplicateEntity(world, history, entity);
					if (id) {
						select(id);
					}
				}}
			>
				<CopyIcon className={surface.itemIcon} weight="bold" />
				Duplicate
			</ContextMenu.Item>
			<ContextMenu.Item
				className={surface.item}
				onClick={() => {
					deleteEntity(world, history, entity);
					select(null);
				}}
			>
				<TrashIcon className={surface.itemIcon} weight="bold" />
				Delete
			</ContextMenu.Item>
			{attached.length > 0 && (
				<ContextMenu.Separator className={surface.divider} />
			)}
			{attached.map(({ component, name }) => (
				<ContextMenu.Item
					key={name}
					className={surface.item}
					onClick={() =>
						removeComponent(world, history, entity, component)
					}
				>
					<MinusCircleIcon
						className={surface.itemIcon}
						weight="bold"
					/>
					Remove {name}
				</ContextMenu.Item>
			))}
		</>
	);
};

export const EntityContextMenu = ({
	entity,
	deps,
	onCreateEntity,
	children,
}: Readonly<{
	entity: EntityId | null;
	deps: MenuDeps | null;
	onCreateEntity?: () => void;
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
			{deps && entity ? (
				<EntityItems entity={entity} deps={deps} />
			) : (
				deps &&
				onCreateEntity && (
					<ContextMenu.Item
						className={surface.item}
						onClick={onCreateEntity}
					>
						<PlusCircleIcon
							className={surface.itemIcon}
							weight="bold"
						/>
						Create entity
					</ContextMenu.Item>
				)
			)}
		</Popup>
	</ContextMenu.Root>
);

export const AddComponentPicker = ({
	entity,
	deps,
	onClose,
}: Readonly<{
	entity: EntityId;
	deps: MenuDeps;
	onClose: () => void;
}>) => {
	const { ecs, world, history } = deps;
	const attached = new Set(
		ecs
			.componentsOf(entity)
			.map((c) => serializableTypeName(c))
			.filter((n): n is string => n !== undefined),
	);
	const names = registeredComponents()
		.map(([name]) => name)
		.filter((name) => !attached.has(name))
		.sort();

	const pick = (name: string) => {
		const ctor = componentClass(name);
		if (ctor) {
			addComponent(world, history, entity, new ctor());
		}
		onClose();
	};

	return (
		<Dialog.Root
			open
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className={surface.backdrop} />
				<Dialog.Popup
					aria-label="Add component"
					className={classNames(
						surface.dialogPopup,
						surface.pickerPanel,
					)}
				>
					<Autocomplete.Root items={names}>
						<Autocomplete.Input
							autoFocus
							placeholder="Add component…"
							className={surface.pickerInput}
						/>
						<Autocomplete.Portal>
							<Autocomplete.Positioner sideOffset={4}>
								<Autocomplete.Popup
									className={classNames(
										surface.surface,
										surface.menu,
									)}
								>
									<Autocomplete.Empty className={surface.pickerEmpty}>
										No components
									</Autocomplete.Empty>
									<Autocomplete.List>
										{(name: string) => (
											<Autocomplete.Item
												key={name}
												value={name}
												className={surface.item}
												onClick={() => pick(name)}
											>
												{name}
											</Autocomplete.Item>
										)}
									</Autocomplete.List>
								</Autocomplete.Popup>
							</Autocomplete.Positioner>
						</Autocomplete.Portal>
					</Autocomplete.Root>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
};
