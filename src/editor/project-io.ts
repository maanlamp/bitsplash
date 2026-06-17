import type { ProjectRpcSchema } from "../project-rpc";

type Requests = ProjectRpcSchema["bun"]["requests"];

type DesktopBridge = {
	saveLevel: (
		params: Requests["saveLevel"]["params"],
	) => Promise<Requests["saveLevel"]["response"]>;
	uploadAsset: (
		params: Requests["uploadAsset"]["params"],
	) => Promise<Requests["uploadAsset"]["response"]>;
};

const getBridge = (): DesktopBridge => {
	const bridge = (globalThis as { bitsplashDesktop?: DesktopBridge })
		.bitsplashDesktop;
	if (!bridge) {
		throw new Error("project-io requires the Electron desktop shell");
	}
	return bridge;
};

export const isDesktop = (): boolean =>
	!!(globalThis as { bitsplashDesktop?: DesktopBridge })
		.bitsplashDesktop;

const blobToBase64 = async (blob: Blob): Promise<string> => {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
};

export const saveLevel = async (
	sceneId: string,
	json: string,
): Promise<void> => {
	await getBridge().saveLevel({ sceneId, json });
};

export const uploadAsset = async (
	filename: string,
	data: Blob,
	overwrite: boolean,
): Promise<{ url: string; existed: boolean }> => {
	return getBridge().uploadAsset({
		filename,
		dataBase64: await blobToBase64(data),
		overwrite,
	});
};
