import { loadEnvConfig } from "@next/env";
import { createServer } from "node:http";
import next from "next";

// Load .env files before importing modules that initialize Prisma.
const dev =
  !process.argv.includes("--production") &&
  process.env.NODE_ENV !== "production";

loadEnvConfig(process.cwd(), dev);

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOST ?? "0.0.0.0";

const app = next({
  dev,
  hostname,
  port,
  ...(dev ? { webpack: true } : {}),
});

async function start() {
  await app.prepare();

  const handle = app.getRequestHandler();

  const httpServer = createServer((request, response) => {
    void handle(request, response);
  });

  // Import only after environment variables have been loaded.
  const { attachSocketServer } = await import(
    "./lib/realtime/socket-server"
  );

  attachSocketServer(httpServer);

  httpServer.listen(port, hostname, () => {
    console.log(
      `> TXMate server listening on http://${hostname}:${port} (${dev ? "development" : "production"})`,
    );
  });
}

start().catch((error: unknown) => {
  console.error("Failed to start TXMate:", error);
  process.exit(1);
});