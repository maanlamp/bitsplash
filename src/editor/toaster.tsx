import { XIcon } from "@phosphor-icons/react/dist/icons/X";
import { Toast } from "@base-ui/react/toast";
import { useEffect, useState } from "react";
import styles from "./toaster.module.scss";
import {
	createWindowToastManager,
	releaseWindowToastManager,
} from "./toast";
import { usePortalContainer } from "./window/portal-container";

const ToastList = () => {
	const { toasts } = Toast.useToastManager();
	return toasts.map((toast) => (
		<Toast.Root key={toast.id} toast={toast} className={styles.toast}>
			<div className={styles.body}>
				<Toast.Title className={styles.title} />
				<Toast.Description className={styles.description} />
			</div>
			<Toast.Close className={styles.close} aria-label="Dismiss">
				<XIcon />
			</Toast.Close>
		</Toast.Root>
	));
};

/**
 * The per-window toast host. Each window shell mounts one; it registers a toast
 * manager under `windowId` and portals into the owning window's document, so
 * toasts routed to this window render here. See {@link toast}/{@link toastError}
 * for routing.
 */
export const Toaster = ({
	windowId,
}: Readonly<{ windowId: string }>) => {
	const [manager] = useState(() =>
		createWindowToastManager(windowId),
	);
	const container = usePortalContainer();
	useEffect(
		() => () => releaseWindowToastManager(windowId),
		[windowId],
	);
	return (
		<Toast.Provider toastManager={manager}>
			<Toast.Portal container={container}>
				<Toast.Viewport className={styles.viewport}>
					<ToastList />
				</Toast.Viewport>
			</Toast.Portal>
		</Toast.Provider>
	);
};
