import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ service: "spawn.sh", status: "ok" });
});

export default app;

