import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ service: "relay.sh", status: "ok" });
});

export default app;

