import { createContext } from "@email-relay/api/context";
import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  parseAdminSessionCookie,
} from "@email-relay/api/admin-auth/cookie";
import { loginAdmin, logoutAdmin } from "@email-relay/api/admin-auth/service";
import { appRouter } from "@email-relay/api/routers/index";
import { createAuth } from "@email-relay/auth";
import { env } from "@email-relay/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => createAuth().handler(c.req.raw));

app.post("/admin/login", async (c) => {
  const body = await c.req.json();
  const parsed = z
    .object({
      password: z.string().min(12),
    })
    .safeParse(body);

  if (!parsed.success) {
    return c.json({ message: "Invalid password payload" }, 400);
  }

  const context = await createContext({ context: c });
  const result = await loginAdmin({
    store: context.authStore,
    password: parsed.data.password,
  });

  if (!result.ok) {
    return c.json({ message: "Invalid password" }, 401);
  }

  c.header("Set-Cookie", createAdminSessionCookie(result.sessionToken, result.expiresAt));
  return c.json({ ok: true, expiresAt: result.expiresAt.toISOString() });
});

app.post("/admin/logout", async (c) => {
  const context = await createContext({ context: c });
  const token = parseAdminSessionCookie(c.req.header("cookie") ?? null);

  await logoutAdmin({
    store: context.authStore,
    token,
  });

  c.header("Set-Cookie", clearAdminSessionCookie());
  return c.json({ ok: true });
});

app.get("/admin/session", async (c) => {
  const context = await createContext({ context: c });
  if (!context.adminSession) {
    return c.json({ authenticated: false }, 401);
  }

  return c.json({
    authenticated: true,
    expiresAt: context.adminSession.expiresAt.toISOString(),
  });
});

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
