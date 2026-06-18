import { AssetDropRegistry } from "./asset-drop-registry";
import { resolveToWebPath } from "./project-io";

AssetDropRegistry.register(
	["sprite", "tileset"],
	["inspector-field"],
	(payload, context) => {
		void resolveToWebPath(payload.path).then((webPath) => {
			context.field?.apply(webPath);
		});
	},
);
