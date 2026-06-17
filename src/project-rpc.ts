export type ProjectRpcSchema = {
	bun: {
		requests: {
			saveLevel: {
				params: { sceneId: string; json: string };
				response: { saved: true };
			};
			uploadAsset: {
				params: {
					filename: string;
					dataBase64: string;
					overwrite: boolean;
				};
				response: { url: string; existed: boolean };
			};
		};
		messages: Record<string, never>;
	};
	webview: {
		requests: Record<string, never>;
		messages: Record<string, never>;
	};
};
