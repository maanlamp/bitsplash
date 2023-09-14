import { defineConfig } from "vite";
import viteTsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [viteTsconfigPaths()],
	server: {
		open: true,
	},
});
