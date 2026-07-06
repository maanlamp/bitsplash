import { createContext, useContext } from "react";
import type { ECS } from "../../engine/ecs";

const InspectorEcsContext = createContext<ECS | null>(null);

export const InspectorEcsProvider = InspectorEcsContext.Provider;

export const useInspectorEcs = (): ECS | null =>
	useContext(InspectorEcsContext);
