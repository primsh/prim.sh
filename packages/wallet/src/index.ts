import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ service: "wallet.sh", status: "ok" });
});

export default app;

