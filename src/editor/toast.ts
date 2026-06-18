import { Toast } from "@base-ui/react/toast";

export const toastManager = Toast.createToastManager();

export const toastError = (title: string): void => {
	toastManager.add({ title, type: "error" });
};
