import { XIcon } from "@phosphor-icons/react";
import { Toast } from "@base-ui/react/toast";
import styles from "./toaster.module.scss";
import { toastManager } from "./toast";

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

export const Toaster = () => (
	<Toast.Provider toastManager={toastManager}>
		<Toast.Portal>
			<Toast.Viewport className={styles.viewport}>
				<ToastList />
			</Toast.Viewport>
		</Toast.Portal>
	</Toast.Provider>
);
