# Control Plane & Unified Inbox Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first deployable slice of the multi-email aggregator: single-admin password auth, D1 foundation tables, inbox-first protected UI, group management, alert read model, and Cloudflare deployment checkpoints.

**Architecture:** Replace the starter multi-user Better Auth flow with a custom single-admin session boundary backed by D1 and secure cookies. Introduce the core mailbox/group/message/alert schema now, but keep connectors out of scope so the first slice ships a real empty-state control plane that reads real D1 data and can be deployed to Cloudflare immediately.

**Tech Stack:** TanStack Router, React, Hono, oRPC, Drizzle ORM, Cloudflare Workers, Cloudflare D1, Vitest, Testing Library

---

## Scope split

The approved spec is Epic-sized, so this plan intentionally covers only **Subproject 1: 控制面与统一收件箱骨架**. Follow-up plans should be written separately for Gmail, Outlook, IMAP, and sync/operations hardening.

## File structure map

### Create
- `vitest.workspace.ts` — workspace-level test runner registration for API + web
- `packages/api/vitest.config.ts` — API/package Vitest config
- `apps/web/vitest.config.ts` — web/package Vitest config
- `apps/web/src/test/setup.ts` — Testing Library + DOM matchers bootstrap
- `packages/db/src/schema/admin.ts` — singleton admin config + admin session tables
- `packages/db/src/schema/mail.ts` — mailbox groups, mailboxes, messages, attachments, sync jobs, alerts
- `packages/api/src/admin-auth/constants.ts` — cookie name, singleton ids, session duration constants
- `packages/api/src/admin-auth/password.ts` — password hashing + verification helpers
- `packages/api/src/admin-auth/cookie.ts` — parse/set/clear admin session cookie helpers
- `packages/api/src/admin-auth/service.ts` — bootstrap admin config, create/destroy/resolve admin sessions
- `packages/api/src/admin-auth/password.test.ts` — password helper regression tests
- `packages/api/src/admin-auth/service.test.ts` — admin auth service tests
- `packages/api/src/inbox/types.ts` — inbox filter/query/result types
- `packages/api/src/inbox/filter.ts` — URL/API filter normalization helpers
- `packages/api/src/inbox/filter.test.ts` — inbox filter tests
- `packages/api/src/inbox/repository.ts` — D1-backed read queries for inbox, mailboxes, groups, alerts
- `packages/api/src/groups/repository.ts` — D1-backed group CRUD
- `packages/api/src/groups/repository.test.ts` — group repository tests
- `packages/api/src/routers/admin.ts` — oRPC admin session procedures (`getSession`)
- `packages/api/src/routers/inbox.ts` — list inbox messages + filter metadata
- `packages/api/src/routers/groups.ts` — list/create/update/delete groups
- `packages/api/src/routers/alerts.ts` — list alerts + summary counts
- `apps/web/src/lib/admin-session.ts` — HTTP client for `/admin/login`, `/admin/logout`, `/admin/session`
- `apps/web/src/components/admin-password-form.tsx` — single password login form
- `apps/web/src/components/admin-password-form.test.tsx` — login form behavior tests
- `apps/web/src/components/app-shell.tsx` — protected app layout with main nav + logout
- `apps/web/src/components/inbox-sidebar.tsx` — left filter rail for inbox-first layout
- `apps/web/src/components/inbox-empty-state.tsx` — empty-state cards for inbox page
- `apps/web/src/components/group-form.tsx` — create/edit group form
- `apps/web/src/routes/_protected.tsx` — protected route layout + auth loader
- `apps/web/src/routes/_protected/inbox.tsx` — unified inbox page
- `apps/web/src/routes/_protected/alerts.tsx` — alerts page
- `apps/web/src/routes/_protected/groups.tsx` — groups page
- `apps/web/src/routes/_protected/mailboxes.tsx` — mailbox list page (read-only empty state for now)
- `apps/web/src/routes/_protected/settings.tsx` — settings page shell (shows session info only in this slice)

### Modify
- `package.json` — add shared test scripts and Vitest deps
- `packages/api/package.json` — add package-local test script if preferred by workspace config
- `apps/web/package.json` — add package-local test script if preferred by workspace config
- `packages/db/src/schema/index.ts` — export new schema modules
- `packages/db/src/index.ts` — expose expanded schema set through Drizzle
- `packages/api/src/context.ts` — resolve admin session from custom cookie instead of Better Auth
- `packages/api/src/index.ts` — protect procedures with `context.adminSession`
- `packages/api/src/routers/index.ts` — compose `admin`, `inbox`, `groups`, `alerts`
- `apps/server/src/index.ts` — add `/admin/login`, `/admin/logout`, `/admin/session` handlers and remove Better Auth route wiring
- `packages/infra/alchemy.run.ts` — bind `ADMIN_BOOTSTRAP_PASSWORD` into the server worker
- `apps/server/.env` — add local bootstrap admin password for development
- `apps/web/src/routes/login.tsx` — replace email/password/sign-up toggle with password-only admin login
- `apps/web/src/routes/index.tsx` — redirect to `/inbox` or `/login`
- `apps/web/src/routes/__root.tsx` — swap starter header for app shell-friendly root layout
- `apps/web/src/components/header.tsx` — replace starter links with control-plane nav or delete if superseded by `app-shell.tsx`
- `apps/web/src/components/user-menu.tsx` — replace Better Auth usage with custom admin session logout behavior
- `apps/web/src/main.tsx` — keep router context but ensure protected layout works with new routes
- `apps/web/src/utils/orpc.ts` — keep credentials include; no behavior change beyond route usage

### Delete
- `apps/web/src/components/sign-up-form.tsx` — multi-user sign-up is out of scope
- `apps/web/src/lib/auth-client.ts` — Better Auth client no longer used in this slice

---

### Task 1: Add a real test harness for API and web packages

**Files:**
- Create: `vitest.workspace.ts`
- Create: `packages/api/vitest.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Create: `packages/api/src/admin-auth/password.test.ts`
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `packages/api/package.json`

- [x] **Step 1: Write the failing test harness smoke test**

```ts
// packages/api/src/admin-auth/password.test.ts
import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("round-trips the bootstrap password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("totally-wrong", hash)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails because the harness and implementation do not exist**

Run: `pnpm exec vitest run packages/api/src/admin-auth/password.test.ts`  
Expected: FAIL with `Command "vitest" not found` or `Cannot find module './password'`

- [x] **Step 3: Add the minimal workspace test setup**

```json
// package.json (append only the shown fields)
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:api": "vitest run --config packages/api/vitest.config.ts",
    "test:web": "vitest run --config apps/web/vitest.config.ts"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.3.0",
    "jsdom": "^26.1.0",
    "vitest": "^3.2.4"
  }
}
```

```ts
// vitest.workspace.ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/api/vitest.config.ts",
  "apps/web/vitest.config.ts",
]);
```

```ts
// packages/api/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api",
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
```

```ts
// apps/web/vitest.config.ts
import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    name: "web",
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
```

```ts
// apps/web/src/test/setup.ts
import "@testing-library/jest-dom/vitest";
```

```json
// apps/web/package.json (append only)
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts"
  }
}
```

```json
// packages/api/package.json (append only)
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts"
  }
}
```

- [x] **Step 4: Write the minimal implementation required for the first test to pass**

```ts
// packages/api/src/admin-auth/password.ts
const PASSWORD_PREFIX = "pbkdf2";
const ITERATIONS = 210_000;
const HASH_BYTES = 32;
const SALT_BYTES = 16;

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function deriveBits(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: ITERATIONS,
      salt,
    },
    key,
    HASH_BYTES * 8,
  );

  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt);
  return [PASSWORD_PREFIX, String(ITERATIONS), toBase64(salt), toBase64(hash)].join(":");
}

export async function verifyPassword(password: string, encoded: string) {
  const [prefix, iterationText, saltText, hashText] = encoded.split(":");
  if (prefix !== PASSWORD_PREFIX || Number(iterationText) !== ITERATIONS) return false;

  const salt = fromBase64(saltText);
  const expected = fromBase64(hashText);
  const actual = await deriveBits(password, salt);

  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
```

- [ ] **Step 5: Run tests, then commit**

Run: `pnpm exec vitest run packages/api/src/admin-auth/password.test.ts`  
Expected: PASS

Run: `pnpm test`  
Expected: PASS with the API test suite green and no web tests yet

Commit:

```bash
git add package.json vitest.workspace.ts packages/api/vitest.config.ts apps/web/vitest.config.ts apps/web/src/test/setup.ts packages/api/package.json apps/web/package.json packages/api/src/admin-auth/password.ts packages/api/src/admin-auth/password.test.ts
git commit -m "test: add workspace vitest harness"
```

### Task 2: Implement single-admin auth backend and protected server context

**Files:**
- Create: `packages/db/src/schema/admin.ts`
- Create: `packages/api/src/admin-auth/constants.ts`
- Create: `packages/api/src/admin-auth/cookie.ts`
- Create: `packages/api/src/admin-auth/service.ts`
- Create: `packages/api/src/admin-auth/service.test.ts`
- Create: `packages/api/src/routers/admin.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/api/src/context.ts`
- Modify: `packages/api/src/index.ts`
- Modify: `packages/api/src/routers/index.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `apps/server/.env`

- [x] **Step 1: Write the failing auth service test**

```ts
// packages/api/src/admin-auth/service.test.ts
import { describe, expect, it } from "vitest";

import { bootstrapAdminConfig, loginAdmin, logoutAdmin, resolveAdminSession } from "./service";

function createMemoryStore() {
  const sessions = new Map<string, { tokenHash: string; expiresAt: Date }>();
  let passwordHash = "";

  return {
    store: {
      getPasswordHash: async () => passwordHash || null,
      setPasswordHash: async (value: string) => {
        passwordHash = value;
      },
      insertSession: async (tokenHash: string, expiresAt: Date) => {
        sessions.set(tokenHash, { tokenHash, expiresAt });
      },
      getSession: async (tokenHash: string) => sessions.get(tokenHash) ?? null,
      deleteSession: async (tokenHash: string) => {
        sessions.delete(tokenHash);
      },
    },
  };
}

describe("admin auth service", () => {
  it("bootstraps, logs in, resolves, and logs out the singleton admin", async () => {
    const { store } = createMemoryStore();

    await bootstrapAdminConfig({ store, bootstrapPassword: "super-secret-password" });
    const loginResult = await loginAdmin({ store, password: "super-secret-password" });

    expect(loginResult.ok).toBe(true);
    if (!loginResult.ok) throw new Error("expected login to succeed");

    await expect(resolveAdminSession({ store, token: loginResult.sessionToken })).resolves.toMatchObject({
      authenticated: true,
    });

    await logoutAdmin({ store, token: loginResult.sessionToken });

    await expect(resolveAdminSession({ store, token: loginResult.sessionToken })).resolves.toMatchObject({
      authenticated: false,
    });
  });
});
```

- [ ] **Step 2: Run the service test and verify it fails because the backend auth files are missing**

Run: `pnpm exec vitest run packages/api/src/admin-auth/service.test.ts`  
Expected: FAIL with `Cannot find module './service'`

- [x] **Step 3: Implement the admin schema, cookie helpers, and service layer**

```ts
// packages/db/src/schema/admin.ts
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const adminConfig = sqliteTable("admin_config", {
  id: text("id").primaryKey().$defaultFn(() => "default"),
  passwordHash: text("password_hash").notNull(),
  sessionMaxAgeDays: integer("session_max_age_days").notNull().default(30),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const adminSession = sqliteTable("admin_session", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});
```

```ts
// packages/api/src/admin-auth/constants.ts
export const ADMIN_CONFIG_ID = "default";
export const ADMIN_SESSION_COOKIE = "email_relay_admin_session";
export const ADMIN_SESSION_MAX_AGE_DAYS = 30;
```

```ts
// packages/api/src/admin-auth/cookie.ts
import { ADMIN_SESSION_COOKIE } from "./constants";

export function parseAdminSessionCookie(header: string | null) {
  if (!header) return null;
  const parts = header.split(/;\s*/);
  const match = parts.find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

export function createAdminSessionCookie(token: string, expiresAt: Date) {
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearAdminSessionCookie() {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
```

```ts
// packages/api/src/admin-auth/service.ts
import { createHash, randomUUID } from "node:crypto";

import { ADMIN_CONFIG_ID, ADMIN_SESSION_MAX_AGE_DAYS } from "./constants";
import { hashPassword, verifyPassword } from "./password";

type AuthStore = {
  getPasswordHash: () => Promise<string | null>;
  setPasswordHash: (value: string) => Promise<void>;
  insertSession: (tokenHash: string, expiresAt: Date) => Promise<void>;
  getSession: (tokenHash: string) => Promise<{ expiresAt: Date } | null>;
  deleteSession: (tokenHash: string) => Promise<void>;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function bootstrapAdminConfig({
  store,
  bootstrapPassword,
}: {
  store: AuthStore;
  bootstrapPassword: string;
}) {
  const existing = await store.getPasswordHash();
  if (existing) return existing;
  const next = await hashPassword(bootstrapPassword);
  await store.setPasswordHash(next);
  return next;
}

export async function loginAdmin({
  store,
  password,
}: {
  store: AuthStore;
  password: string;
}): Promise<{ ok: true; sessionToken: string; expiresAt: Date } | { ok: false }> {
  const passwordHash = await store.getPasswordHash();
  if (!passwordHash) return { ok: false };

  const matches = await verifyPassword(password, passwordHash);
  if (!matches) return { ok: false };

  const sessionToken = randomUUID();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  await store.insertSession(sha256(sessionToken), expiresAt);
  return { ok: true, sessionToken, expiresAt };
}

export async function resolveAdminSession({ store, token }: { store: AuthStore; token: string | null }) {
  if (!token) return { authenticated: false as const };
  const session = await store.getSession(sha256(token));
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return { authenticated: false as const };
  }
  return { authenticated: true as const, expiresAt: session.expiresAt, adminConfigId: ADMIN_CONFIG_ID };
}

export async function logoutAdmin({ store, token }: { store: AuthStore; token: string | null }) {
  if (!token) return;
  await store.deleteSession(sha256(token));
}
```

```ts
// packages/api/src/context.ts
import { and, eq } from "drizzle-orm";

import { createDb } from "@email-relay/db";
import { adminConfig, adminSession } from "@email-relay/db/schema/admin";
import type { Context as HonoContext } from "hono";

import { parseAdminSessionCookie } from "./admin-auth/cookie";
import { bootstrapAdminConfig, resolveAdminSession } from "./admin-auth/service";

export async function createContext({ context }: { context: HonoContext }) {
  const db = createDb();
  const store = {
    getPasswordHash: async () => {
      const row = await db.query.adminConfig.findFirst();
      return row?.passwordHash ?? null;
    },
    setPasswordHash: async (value: string) => {
      await db.insert(adminConfig).values({ id: "default", passwordHash: value }).onConflictDoUpdate({
        target: adminConfig.id,
        set: { passwordHash: value },
      });
    },
    insertSession: async (tokenHash: string, expiresAt: Date) => {
      await db.insert(adminSession).values({ id: crypto.randomUUID(), tokenHash, expiresAt });
    },
    getSession: async (tokenHash: string) => {
      const row = await db.query.adminSession.findFirst({ where: eq(adminSession.tokenHash, tokenHash) });
      return row ? { expiresAt: row.expiresAt } : null;
    },
    deleteSession: async (tokenHash: string) => {
      await db.delete(adminSession).where(eq(adminSession.tokenHash, tokenHash));
    },
  };

  await bootstrapAdminConfig({
    store,
    bootstrapPassword: context.env.ADMIN_BOOTSTRAP_PASSWORD,
  });

  const token = parseAdminSessionCookie(context.req.header("cookie") ?? null);
  const adminSessionState = await resolveAdminSession({ store, token });

  return {
    adminSession: adminSessionState.authenticated ? adminSessionState : null,
    db,
    authStore: store,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

```ts
// packages/api/src/index.ts
import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();
export const publicProcedure = o;

const requireAdmin = o.middleware(async ({ context, next }) => {
  if (!context.adminSession) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next({
    context: {
      ...context,
      adminSession: context.adminSession,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAdmin);
```

```ts
// packages/api/src/routers/admin.ts
import { protectedProcedure } from "../index";

export const adminRouter = {
  getSession: protectedProcedure.handler(({ context }) => ({
    authenticated: true,
    expiresAt: context.adminSession.expiresAt,
  })),
};
```

```ts
// packages/api/src/routers/index.ts
import { adminRouter } from "./admin";

export const appRouter = {
  admin: adminRouter,
};
```

```ts
// apps/server/src/index.ts (show only the new auth endpoints + removed Better Auth wiring)
import { createAdminSessionCookie, clearAdminSessionCookie, parseAdminSessionCookie } from "@email-relay/api/admin-auth/cookie";
import { loginAdmin, logoutAdmin } from "@email-relay/api/admin-auth/service";
import { z } from "zod";

app.post("/admin/login", async (c) => {
  const body = await c.req.json();
  const parsed = z.object({ password: z.string().min(12) }).safeParse(body);
  if (!parsed.success) return c.json({ message: "Invalid password payload" }, 400);

  const context = await createContext({ context: c });
  const result = await loginAdmin({ store: context.authStore, password: parsed.data.password });
  if (!result.ok) return c.json({ message: "Invalid password" }, 401);

  c.header("Set-Cookie", createAdminSessionCookie(result.sessionToken, result.expiresAt));
  return c.json({ ok: true, expiresAt: result.expiresAt.toISOString() });
});

app.post("/admin/logout", async (c) => {
  const context = await createContext({ context: c });
  const token = parseAdminSessionCookie(c.req.header("cookie") ?? null);
  await logoutAdmin({ store: context.authStore, token });
  c.header("Set-Cookie", clearAdminSessionCookie());
  return c.json({ ok: true });
});

app.get("/admin/session", async (c) => {
  const context = await createContext({ context: c });
  if (!context.adminSession) {
    return c.json({ authenticated: false }, 401);
  }
  return c.json({ authenticated: true, expiresAt: context.adminSession.expiresAt.toISOString() });
});
```

```ts
// packages/infra/alchemy.run.ts (inside server bindings)
bindings: {
  DB: db,
  CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
  BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
  BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
  ADMIN_BOOTSTRAP_PASSWORD: alchemy.secret.env.ADMIN_BOOTSTRAP_PASSWORD!,
},
```

```env
# apps/server/.env (append)
ADMIN_BOOTSTRAP_PASSWORD=replace-with-a-long-local-dev-password
```

- [x] **Step 4: Run the auth tests and type checks**

Run: `pnpm exec vitest run packages/api/src/admin-auth/password.test.ts packages/api/src/admin-auth/service.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

- [ ] **Step 5: Deploy the backend-only vertical slice and commit**

Run:

```bash
set -a
source ./.env
set +a
pnpm run deploy
```

Expected: deployment succeeds, and `GET https://<server-url>/admin/session` returns `401 {"authenticated":false}` before login.

Commit:

```bash
git add packages/db/src/schema/admin.ts packages/db/src/schema/index.ts packages/db/src/index.ts packages/api/src/admin-auth/constants.ts packages/api/src/admin-auth/cookie.ts packages/api/src/admin-auth/service.ts packages/api/src/admin-auth/service.test.ts packages/api/src/context.ts packages/api/src/index.ts packages/api/src/routers/admin.ts packages/api/src/routers/index.ts apps/server/src/index.ts packages/infra/alchemy.run.ts apps/server/.env
git commit -m "feat: add single-admin auth backend"
```

### Task 3: Add the D1 foundation for groups, mailboxes, inbox messages, sync jobs, and alerts

**Files:**
- Create: `packages/db/src/schema/mail.ts`
- Create: `packages/api/src/inbox/types.ts`
- Create: `packages/api/src/inbox/filter.ts`
- Create: `packages/api/src/inbox/filter.test.ts`
- Create: `packages/api/src/inbox/repository.ts`
- Create: `packages/api/src/groups/repository.ts`
- Create: `packages/api/src/groups/repository.test.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/api/src/routers/index.ts`
- Create: `packages/api/src/routers/inbox.ts`
- Create: `packages/api/src/routers/groups.ts`
- Create: `packages/api/src/routers/alerts.ts`

- [x] **Step 1: Write the failing tests for inbox filter normalization and group CRUD**

```ts
// packages/api/src/inbox/filter.test.ts
import { describe, expect, it } from "vitest";

import { normalizeInboxFilters } from "./filter";

describe("normalizeInboxFilters", () => {
  it("trims search and defaults to descending receivedAt order", () => {
    expect(normalizeInboxFilters({ search: "  invoice  " })).toEqual({
      search: "invoice",
      provider: undefined,
      groupId: undefined,
      mailboxId: undefined,
      limit: 20,
    });
  });
});
```

```ts
// packages/api/src/groups/repository.test.ts
import { describe, expect, it } from "vitest";

import { createGroupRepository } from "./repository";

describe("group repository", () => {
  it("creates and lists groups in createdAt descending order", async () => {
    const rows: Array<{ id: string; name: string; kind: string }> = [];
    const repository = createGroupRepository({
      insert: async (row) => rows.push(row),
      list: async () => [...rows].reverse(),
    });

    await repository.create({ name: "Client A", kind: "client" });
    await repository.create({ name: "Personal", kind: "personal" });

    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({ name: "Personal" }),
      expect.objectContaining({ name: "Client A" }),
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail because the filter and repository modules do not exist**

Run: `pnpm exec vitest run packages/api/src/inbox/filter.test.ts packages/api/src/groups/repository.test.ts`  
Expected: FAIL with missing module errors

- [x] **Step 3: Implement the schema, filter helper, repositories, and read routers**

```ts
// packages/db/src/schema/mail.ts
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const mailboxGroup = sqliteTable("mailbox_group", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const mailbox = sqliteTable("mailbox", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text("group_id").references(() => mailboxGroup.id, { onDelete: "set null" }),
  address: text("address").notNull().unique(),
  provider: text("provider").notNull(),
  authType: text("auth_type").notNull(),
  status: text("status").notNull().default("pending"),
  selectedFoldersJson: text("selected_folders_json").notNull().default("[]"),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
  lastSuccessfulSyncAt: integer("last_successful_sync_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [index("mailbox_group_idx").on(table.groupId)]);

export const mailMessage = sqliteTable("mail_message", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  mailboxId: text("mailbox_id").notNull().references(() => mailbox.id, { onDelete: "cascade" }),
  providerMessageId: text("provider_message_id").notNull(),
  internetMessageId: text("internet_message_id"),
  subject: text("subject").notNull().default(""),
  snippet: text("snippet").notNull().default(""),
  fromJson: text("from_json").notNull(),
  toJson: text("to_json").notNull().default("[]"),
  ccJson: text("cc_json").notNull().default("[]"),
  bodyHtml: text("body_html").notNull().default(""),
  bodyText: text("body_text").notNull().default(""),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
}, (table) => [index("mail_message_mailbox_received_idx").on(table.mailboxId, table.receivedAt)]);

export const syncJob = sqliteTable("sync_job", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  mailboxId: text("mailbox_id").references(() => mailbox.id, { onDelete: "set null" }),
  groupId: text("group_id").references(() => mailboxGroup.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  status: text("status").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const syncAlert = sqliteTable("sync_alert", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  mailboxId: text("mailbox_id").references(() => mailbox.id, { onDelete: "set null" }),
  groupId: text("group_id").references(() => mailboxGroup.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("open"),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
});
```

```ts
// packages/api/src/inbox/types.ts
export type InboxFilters = {
  search?: string;
  provider?: string;
  groupId?: string;
  mailboxId?: string;
  limit?: number;
};
```

```ts
// packages/api/src/inbox/filter.ts
import type { InboxFilters } from "./types";

const DEFAULT_LIMIT = 20;

export function normalizeInboxFilters(input: InboxFilters): Required<Pick<InboxFilters, "limit">> & InboxFilters {
  const search = input.search?.trim() || undefined;
  return {
    search,
    provider: input.provider || undefined,
    groupId: input.groupId || undefined,
    mailboxId: input.mailboxId || undefined,
    limit: input.limit && input.limit > 0 ? Math.min(input.limit, 100) : DEFAULT_LIMIT,
  };
}
```

```ts
// packages/api/src/groups/repository.ts
export function createGroupRepository(deps: {
  insert: (row: { id: string; name: string; kind: string; description?: string }) => Promise<void>;
  list: () => Promise<Array<{ id: string; name: string; kind: string; description?: string }>>;
}) {
  return {
    async create(input: { name: string; kind: string; description?: string }) {
      const row = { id: crypto.randomUUID(), ...input };
      await deps.insert(row);
      return row;
    },
    async list() {
      return deps.list();
    },
  };
}
```

```ts
// packages/api/src/inbox/repository.ts
import { and, desc, eq, like } from "drizzle-orm";

import { mailbox, mailboxGroup, mailMessage, syncAlert } from "@email-relay/db/schema/mail";

import { normalizeInboxFilters } from "./filter";
import type { InboxFilters } from "./types";

export function createInboxRepository(db: any) {
  return {
    async listMessages(input: InboxFilters) {
      const filters = normalizeInboxFilters(input);
      const where = and(
        filters.provider ? eq(mailbox.provider, filters.provider) : undefined,
        filters.groupId ? eq(mailbox.groupId, filters.groupId) : undefined,
        filters.mailboxId ? eq(mailbox.id, filters.mailboxId) : undefined,
        filters.search ? like(mailMessage.bodyText, `%${filters.search}%`) : undefined,
      );

      return db
        .select({
          id: mailMessage.id,
          subject: mailMessage.subject,
          snippet: mailMessage.snippet,
          receivedAt: mailMessage.receivedAt,
          isRead: mailMessage.isRead,
          mailboxAddress: mailbox.address,
          provider: mailbox.provider,
        })
        .from(mailMessage)
        .innerJoin(mailbox, eq(mailMessage.mailboxId, mailbox.id))
        .where(where)
        .orderBy(desc(mailMessage.receivedAt))
        .limit(filters.limit);
    },

    async listFilters() {
      return {
        groups: await db.select({ id: mailboxGroup.id, name: mailboxGroup.name }).from(mailboxGroup),
        mailboxes: await db.select({ id: mailbox.id, address: mailbox.address, provider: mailbox.provider }).from(mailbox),
      };
    },

    async listAlerts() {
      return db.select().from(syncAlert).orderBy(desc(syncAlert.createdAt)).limit(50);
    },
  };
}
```

```ts
// packages/api/src/routers/inbox.ts
import { z } from "zod";

import { protectedProcedure } from "../index";
import { createInboxRepository } from "../inbox/repository";

export const inboxRouter = {
  listMessages: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        provider: z.string().optional(),
        groupId: z.string().optional(),
        mailboxId: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
    )
    .handler(({ context, input }) => createInboxRepository(context.db).listMessages(input)),
  listFilters: protectedProcedure.handler(({ context }) => createInboxRepository(context.db).listFilters()),
};
```

```ts
// packages/api/src/routers/groups.ts
import { z } from "zod";

import { mailboxGroup } from "@email-relay/db/schema/mail";

import { protectedProcedure } from "../index";
import { createGroupRepository } from "../groups/repository";

export const groupsRouter = {
  list: protectedProcedure.handler(async ({ context }) => {
    return context.db.select().from(mailboxGroup).orderBy(mailboxGroup.createdAt);
  }),
  create: protectedProcedure
    .input(z.object({ name: z.string().min(2), kind: z.enum(["personal", "project", "client", "other"]), description: z.string().optional() }))
    .handler(async ({ context, input }) => {
      const repository = createGroupRepository({
        insert: async (row) => {
          await context.db.insert(mailboxGroup).values(row);
        },
        list: async () => context.db.select().from(mailboxGroup),
      });
      return repository.create(input);
    }),
};
```

```ts
// packages/api/src/routers/alerts.ts
import { protectedProcedure } from "../index";
import { createInboxRepository } from "../inbox/repository";

export const alertsRouter = {
  list: protectedProcedure.handler(({ context }) => createInboxRepository(context.db).listAlerts()),
};
```

```ts
// packages/api/src/routers/index.ts
import { adminRouter } from "./admin";
import { alertsRouter } from "./alerts";
import { groupsRouter } from "./groups";
import { inboxRouter } from "./inbox";

export const appRouter = {
  admin: adminRouter,
  inbox: inboxRouter,
  groups: groupsRouter,
  alerts: alertsRouter,
};
```

- [x] **Step 4: Run tests, generate the migration, and verify types**

Run: `pnpm exec vitest run packages/api/src/inbox/filter.test.ts packages/api/src/groups/repository.test.ts`  
Expected: PASS

Run: `pnpm run db:generate`  
Expected: new migration generated for `admin_config`, `admin_session`, `mailbox_group`, `mailbox`, `mail_message`, `sync_job`, `sync_alert`

Run: `pnpm run check-types`  
Expected: PASS

- [ ] **Step 5: Commit the data foundation**

```bash
git add packages/db/src/schema/mail.ts packages/db/src/schema/index.ts packages/api/src/inbox/types.ts packages/api/src/inbox/filter.ts packages/api/src/inbox/filter.test.ts packages/api/src/inbox/repository.ts packages/api/src/groups/repository.ts packages/api/src/groups/repository.test.ts packages/api/src/routers/inbox.ts packages/api/src/routers/groups.ts packages/api/src/routers/alerts.ts packages/api/src/routers/index.ts packages/db/src/migrations
git commit -m "feat: add inbox and group data foundation"
```

### Task 4: Build the inbox-first protected web shell and remove the starter multi-user flow

**Files:**
- Create: `apps/web/src/lib/admin-session.ts`
- Create: `apps/web/src/components/admin-password-form.tsx`
- Create: `apps/web/src/components/admin-password-form.test.tsx`
- Create: `apps/web/src/components/app-shell.tsx`
- Create: `apps/web/src/components/inbox-sidebar.tsx`
- Create: `apps/web/src/components/inbox-empty-state.tsx`
- Create: `apps/web/src/components/group-form.tsx`
- Create: `apps/web/src/routes/_protected.tsx`
- Create: `apps/web/src/routes/_protected/inbox.tsx`
- Create: `apps/web/src/routes/_protected/alerts.tsx`
- Create: `apps/web/src/routes/_protected/groups.tsx`
- Create: `apps/web/src/routes/_protected/mailboxes.tsx`
- Create: `apps/web/src/routes/_protected/settings.tsx`
- Modify: `apps/web/src/routes/login.tsx`
- Modify: `apps/web/src/routes/index.tsx`
- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/src/components/user-menu.tsx`
- Delete: `apps/web/src/components/sign-up-form.tsx`
- Delete: `apps/web/src/lib/auth-client.ts`

- [x] **Step 1: Write the failing admin login form test**

```tsx
// apps/web/src/components/admin-password-form.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AdminPasswordForm from "./admin-password-form";

describe("AdminPasswordForm", () => {
  it("submits only a password and calls the login handler", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<AdminPasswordForm onLogin={onLogin} isSubmitting={false} error={null} />);

    fireEvent.change(screen.getByLabelText("管理员密码"), {
      target: { value: "a-very-long-admin-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith("a-very-long-admin-password");
    });
  });
});
```

- [ ] **Step 2: Run the web test and verify it fails because the new client and component do not exist**

Run: `pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/components/admin-password-form.test.tsx`  
Expected: FAIL with missing module errors

- [x] **Step 3: Implement the client, routes, and shell components**

```ts
// apps/web/src/lib/admin-session.ts
export type AdminSession = { authenticated: true; expiresAt: string };

export async function getAdminSession() {
  const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/admin/session`, {
    credentials: "include",
  });

  if (!response.ok) return null;
  return (await response.json()) as AdminSession;
}

export async function loginAdmin(password: string) {
  const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/admin/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "登录失败" }));
    throw new Error(body.message ?? "登录失败");
  }
}

export async function logoutAdmin() {
  await fetch(`${import.meta.env.VITE_SERVER_URL}/admin/logout`, {
    method: "POST",
    credentials: "include",
  });
}
```

```tsx
// apps/web/src/components/admin-password-form.tsx
import { Button } from "@email-relay/ui/components/button";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import { useForm } from "@tanstack/react-form";

export default function AdminPasswordForm({
  onLogin,
  isSubmitting,
  error,
}: {
  onLogin: (password: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}) {
  const form = useForm({
    defaultValues: { password: "" },
    onSubmit: async ({ value }) => onLogin(value.password),
  });

  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-xl border p-6">
      <h1 className="text-2xl font-semibold">管理员登录</h1>
      <p className="mt-2 text-sm text-muted-foreground">输入系统管理员密码进入统一收件箱。</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          form.handleSubmit();
        }}
      >
        <form.Field name="password">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>管理员密码</Label>
              <Input
                id={field.name}
                type="password"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </div>
          )}
        </form.Field>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "登录中..." : "登录"}
        </Button>
      </form>
    </div>
  );
}
```

```tsx
// apps/web/src/routes/login.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import AdminPasswordForm from "@/components/admin-password-form";
import { loginAdmin } from "@/lib/admin-session";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <AdminPasswordForm
      error={error}
      isSubmitting={isSubmitting}
      onLogin={async (password) => {
        setIsSubmitting(true);
        setError(null);
        try {
          await loginAdmin(password);
          navigate({ to: "/inbox" });
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "登录失败");
        } finally {
          setIsSubmitting(false);
        }
      }}
    />
  );
}
```

```tsx
// apps/web/src/routes/_protected.tsx
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import AppShell from "@/components/app-shell";
import { getAdminSession } from "@/lib/admin-session";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async () => {
    const session = await getAdminSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
```

```tsx
// apps/web/src/components/app-shell.tsx
import { Button } from "@email-relay/ui/components/button";
import { Link, useNavigate } from "@tanstack/react-router";

import { logoutAdmin } from "@/lib/admin-session";

const NAV_ITEMS = [
  { to: "/inbox", label: "Inbox" },
  { to: "/alerts", label: "Alerts" },
  { to: "/groups", label: "Groups" },
  { to: "/mailboxes", label: "Mailboxes" },
  { to: "/settings", label: "Settings" },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="grid min-h-svh grid-cols-[240px_1fr]">
      <aside className="border-r px-4 py-6">
        <div className="mb-6 text-lg font-semibold">Email Relay Admin</div>
        <nav className="grid gap-2">
          {NAV_ITEMS.map((item) => (
            <Link key={item.to} to={item.to} className="rounded-md px-3 py-2 hover:bg-muted">
              {item.label}
            </Link>
          ))}
        </nav>
        <Button
          variant="outline"
          className="mt-6 w-full"
          onClick={async () => {
            await logoutAdmin();
            navigate({ to: "/login" });
          }}
        >
          退出登录
        </Button>
      </aside>
      <main className="min-w-0 bg-background px-6 py-6">{children}</main>
    </div>
  );
}
```

```tsx
// apps/web/src/components/inbox-sidebar.tsx
export default function InboxSidebar({
  groups,
  mailboxes,
}: {
  groups: Array<{ id: string; name: string }>;
  mailboxes: Array<{ id: string; address: string; provider: string }>;
}) {
  return (
    <div className="space-y-6 rounded-xl border p-4">
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Groups</h2>
        <ul className="space-y-1 text-sm">
          {groups.length === 0 ? <li className="text-muted-foreground">暂无分组</li> : null}
          {groups.map((group) => (
            <li key={group.id}>{group.name}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Mailboxes</h2>
        <ul className="space-y-1 text-sm">
          {mailboxes.length === 0 ? <li className="text-muted-foreground">暂无已接入邮箱</li> : null}
          {mailboxes.map((mailbox) => (
            <li key={mailbox.id}>{mailbox.address}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

```tsx
// apps/web/src/components/inbox-empty-state.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@email-relay/ui/components/card";

export default function InboxEmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>收件箱还是空的</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>当前还没有同步到任何邮件。</p>
        <p>下一步先完成 Gmail / Outlook / IMAP 连接器计划，再把真实邮件流接进这里。</p>
      </CardContent>
    </Card>
  );
}
```

```tsx
// apps/web/src/routes/_protected/inbox.tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import InboxEmptyState from "@/components/inbox-empty-state";
import InboxSidebar from "@/components/inbox-sidebar";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const filters = useQuery(orpc.inbox.listFilters.queryOptions());
  const messages = useQuery(orpc.inbox.listMessages.queryOptions({ limit: 20 }));

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <InboxSidebar
        groups={filters.data?.groups ?? []}
        mailboxes={filters.data?.mailboxes ?? []}
      />
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">统一收件箱</h1>
          <p className="text-sm text-muted-foreground">这里会显示所有已同步邮件的聚合视图。</p>
        </div>
        {messages.data && messages.data.length > 0 ? (
          <div className="rounded-xl border">
            {messages.data.map((message) => (
              <div key={message.id} className="border-b px-4 py-3 last:border-b-0">
                <div className="font-medium">{message.subject || "(无主题)"}</div>
                <div className="text-sm text-muted-foreground">{message.mailboxAddress}</div>
              </div>
            ))}
          </div>
        ) : (
          <InboxEmptyState />
        )}
      </div>
    </div>
  );
}
```

```tsx
// apps/web/src/routes/index.tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

import { getAdminSession } from "@/lib/admin-session";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getAdminSession();
    throw redirect({ to: session ? "/inbox" : "/login" });
  },
  component: () => null,
});
```

- [x] **Step 4: Run web tests, type checks, and a local dev smoke build**

Run: `pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/components/admin-password-form.test.tsx`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run build`  
Expected: PASS

- [ ] **Step 5: Deploy the first full control-plane UI slice and commit**

Run:

```bash
set -a
source ./.env
set +a
pnpm run deploy
```

Expected:
- web deployment succeeds
- opening `https://<web-url>/login` shows password-only login screen
- wrong password stays on login page with error
- correct password redirects to `/inbox`
- `/inbox` renders the real empty-state shell backed by D1 queries

Commit:

```bash
git add apps/web/src/lib/admin-session.ts apps/web/src/components/admin-password-form.tsx apps/web/src/components/admin-password-form.test.tsx apps/web/src/components/app-shell.tsx apps/web/src/components/inbox-sidebar.tsx apps/web/src/components/inbox-empty-state.tsx apps/web/src/routes/_protected.tsx apps/web/src/routes/_protected/inbox.tsx apps/web/src/routes/index.tsx apps/web/src/routes/login.tsx apps/web/src/routes/__root.tsx apps/web/src/components/user-menu.tsx apps/web/src/main.tsx apps/web/src/routeTree.gen.ts apps/web/src/components/sign-up-form.tsx apps/web/src/lib/auth-client.ts
git commit -m "feat: add inbox-first admin shell"
```

### Task 5: Add groups management, alerts page, mailbox page, and a Cloudflare verification checklist

**Files:**
- Create: `apps/web/src/components/group-form.tsx`
- Modify: `apps/web/src/routes/_protected/groups.tsx`
- Create: `apps/web/src/routes/_protected/alerts.tsx`
- Create: `apps/web/src/routes/_protected/mailboxes.tsx`
- Create: `apps/web/src/routes/_protected/settings.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `packages/api/src/routers/groups.ts`
- Modify: `packages/api/src/routers/alerts.ts`

- [x] **Step 1: Write the failing group management UI test**

```tsx
// apps/web/src/components/group-form.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GroupForm from "./group-form";

describe("GroupForm", () => {
  it("submits the group name and kind", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GroupForm onSubmit={onSubmit} isSubmitting={false} />);

    fireEvent.change(screen.getByLabelText("分组名称"), { target: { value: "客户 A" } });
    fireEvent.change(screen.getByLabelText("分组类型"), { target: { value: "client" } });
    fireEvent.click(screen.getByRole("button", { name: "保存分组" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ name: "客户 A", kind: "client", description: "" });
    });
  });
});
```

- [ ] **Step 2: Run the UI test and verify it fails because the component does not exist**

Run: `pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/components/group-form.test.tsx`  
Expected: FAIL with missing module error

- [x] **Step 3: Implement groups CRUD UI and the remaining protected pages**

```tsx
// apps/web/src/components/group-form.tsx
import { Button } from "@email-relay/ui/components/button";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import { useForm } from "@tanstack/react-form";

export default function GroupForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (value: { name: string; kind: string; description: string }) => Promise<void>;
  isSubmitting: boolean;
}) {
  const form = useForm({
    defaultValues: { name: "", kind: "personal", description: "" },
    onSubmit: async ({ value }) => onSubmit(value),
  });

  return (
    <form
      className="space-y-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>分组名称</Label>
            <Input id={field.name} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />
          </div>
        )}
      </form.Field>
      <form.Field name="kind">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>分组类型</Label>
            <select
              id={field.name}
              className="h-10 w-full rounded-md border bg-background px-3"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            >
              <option value="personal">个人</option>
              <option value="project">项目</option>
              <option value="client">客户</option>
              <option value="other">其他</option>
            </select>
          </div>
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>说明</Label>
            <Input id={field.name} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />
          </div>
        )}
      </form.Field>
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "保存中..." : "保存分组"}</Button>
    </form>
  );
}
```

```tsx
// apps/web/src/routes/_protected/groups.tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import GroupForm from "@/components/group-form";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/groups")({
  component: GroupsPage,
});

function GroupsPage() {
  const groups = useQuery(orpc.groups.list.queryOptions());
  const createGroup = useMutation(
    orpc.groups.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.groups.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.listFilters.queryKey() });
      },
    }),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <GroupForm
        isSubmitting={createGroup.isPending}
        onSubmit={(value) => createGroup.mutateAsync(value)}
      />
      <div className="rounded-xl border p-4">
        <h1 className="mb-4 text-xl font-semibold">分组</h1>
        <ul className="space-y-3">
          {(groups.data ?? []).map((group) => (
            <li key={group.id} className="rounded-lg border p-3">
              <div className="font-medium">{group.name}</div>
              <div className="text-sm text-muted-foreground">{group.kind}</div>
            </li>
          ))}
          {groups.data?.length === 0 ? <li className="text-sm text-muted-foreground">还没有分组</li> : null}
        </ul>
      </div>
    </div>
  );
}
```

```tsx
// apps/web/src/routes/_protected/alerts.tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  const alerts = useQuery(orpc.alerts.list.queryOptions());

  return (
    <div className="rounded-xl border p-4">
      <h1 className="mb-4 text-2xl font-semibold">告警面板</h1>
      {alerts.data?.length ? (
        <ul className="space-y-3">
          {alerts.data.map((alert) => (
            <li key={alert.id} className="rounded-lg border p-3">
              <div className="font-medium">{alert.title}</div>
              <div className="text-sm text-muted-foreground">{alert.detail}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">当前没有告警。</p>
      )}
    </div>
  );
}
```

```tsx
// apps/web/src/routes/_protected/mailboxes.tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/mailboxes")({
  component: MailboxesPage,
});

function MailboxesPage() {
  const filters = useQuery(orpc.inbox.listFilters.queryOptions());

  return (
    <div className="rounded-xl border p-4">
      <h1 className="mb-4 text-2xl font-semibold">邮箱</h1>
      {filters.data?.mailboxes?.length ? (
        <ul className="space-y-3">
          {filters.data.mailboxes.map((mailbox) => (
            <li key={mailbox.id} className="rounded-lg border p-3">
              <div className="font-medium">{mailbox.address}</div>
              <div className="text-sm text-muted-foreground">{mailbox.provider}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">还没有已接入邮箱。下一份计划会在这里接入 Gmail / Outlook / IMAP。</p>
      )}
    </div>
  );
}
```

```tsx
// apps/web/src/routes/_protected/settings.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="rounded-xl border p-4">
      <h1 className="mb-2 text-2xl font-semibold">设置</h1>
      <p className="text-sm text-muted-foreground">本切片只显示会话与系统说明；密码轮换和保留策略放到后续计划。</p>
    </div>
  );
}
```

- [x] **Step 4: Run tests and full verification**

Run: `pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/components/group-form.test.tsx apps/web/src/components/admin-password-form.test.tsx`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run build`  
Expected: PASS

- [ ] **Step 5: Deploy to Cloudflare and complete the operator checklist**

Run:

```bash
set -a
source ./.env
set +a
pnpm run deploy
```

Expected deployment checklist:
- `https://<web-url>/login` reachable
- login succeeds with the configured admin password
- `https://<web-url>/inbox` shows inbox shell
- `https://<web-url>/groups` can create a real D1-backed group
- `https://<web-url>/alerts` loads without crashing
- server logs show no auth or RPC exceptions

Commit:

```bash
git add apps/web/src/components/group-form.tsx apps/web/src/components/group-form.test.tsx apps/web/src/routes/_protected/groups.tsx apps/web/src/routes/_protected/alerts.tsx apps/web/src/routes/_protected/mailboxes.tsx apps/web/src/routes/_protected/settings.tsx packages/api/src/routers/groups.ts packages/api/src/routers/alerts.ts
git commit -m "feat: add group management and control-plane pages"
```

---

## Self-review

### Spec coverage
- 单管理员密码登录：Task 2 + Task 4
- Cloudflare 可部署小步推进：Task 2 / 4 / 5 deploy checkpoints
- D1 基础模型：Task 3
- 统一收件箱首页：Task 4
- 左侧筛选：Task 4
- 分组管理：Task 5
- 告警面板：Task 5
- 邮箱页与设置页骨架：Task 5
- 搜索/全文搜索基础：Task 3 read-model + Task 4 inbox query plumbing

### Placeholder scan
- No placeholder markers inside executable steps
- Deferred work is explicitly out of scope and isolated to future plans, not hidden inside this plan

### Type consistency
- `adminSession` is the protected context field everywhere
- `InboxFilters` is the inbox filter contract everywhere
- `mailboxGroup`, `mailbox`, `mailMessage`, `syncAlert`, `syncJob` naming is consistent between schema and routers
