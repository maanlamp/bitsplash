import { createContext, useContext } from "react";
import type AssetManager from "../engine/assets";

const AssetManagerContext = createContext<AssetManager | null>(null);

export const AssetManagerProvider = AssetManagerContext.Provider;

export const useAssetManager = (): AssetManager | null =>
	useContext(AssetManagerContext);
