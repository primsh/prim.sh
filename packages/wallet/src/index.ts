import { Hono } from "hono";
import { createAgentStackMiddleware } from "@agentstack/x402-middleware";

const PAY_TO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NETWORK = "eip155:8453";

const app = new Hono();

app.use(
  "*",
  createAgentStackMiddleware(
    {
      payTo: PAY_TO_ADDRESS,
      network: NETWORK,
      freeRoutes: ["GET /", "POST /v1/wallets"],
    },
    {},
  ),
);

app.get("/", (c) => {
  return c.json({ service: "wallet.sh", status: "ok" });
});

export default app;

