// Starts vite dev server using the programmatic API (avoids CLI --root issue)
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(__dirname, "frontend");

const require = createRequire(import.meta.url);
const { createServer } = require(join(frontendDir, "node_modules", "vite"));

const server = await createServer({
  root: frontendDir,
  configFile: join(frontendDir, "vite.config.ts"),
  server: {
    port: 5173,
    host: "localhost",
    strictPort: true,
  },
});

await server.listen();
server.printUrls();
