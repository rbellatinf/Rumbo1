import { spawn } from "node:child_process";
import express from "express";

const PORT = Number(process.env.PORT || 4000);
const GATEWAY_PORT = Number(process.env.RUMBO_GATEWAY_PORT || 4001);
const CORE_PORT = Number(process.env.RUMBO_CORE_PORT || 4002);
const API_KEY = process.env.RUMBO_API_KEY || "";

const gateway = spawn(process.execPath, [new URL("./gateway.mjs", import.meta.url).pathname], {
  env: {
    ...process.env,
    PORT: String(GATEWAY_PORT),
    RUMBO_CORE_PORT: String(CORE_PORT),
  },
  stdio: "inherit",
});

gateway.on("exit", (code) => {
  console.error(`Rumbo gateway exited with ${code}`);
  process.exit(code ?? 1);
});

const app = express();
app.disable("x-powered-by");
app.use(express.raw({ type: "*/*", limit: "1mb" }));

app.use(async (req, res) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null || key === "host" || key === "content-length" || key.toLowerCase() === "x-rumbo-api-key") continue;
      headers.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    if (API_KEY) headers.set("X-Rumbo-API-Key", API_KEY);

    const body = ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.isBuffer(req.body) ? req.body : undefined;
    const upstream = await fetch(`http://127.0.0.1:${GATEWAY_PORT}${req.originalUrl}`, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "transfer-encoding", "connection"].includes(key.toLowerCase())) res.setHeader(key, value);
    });
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: { message: "Rumbo API no respondió." } });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Rumbo public edge listening on ${PORT}; gateway=${GATEWAY_PORT}; core=${CORE_PORT}`));
