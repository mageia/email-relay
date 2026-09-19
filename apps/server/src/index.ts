import { createContext } from "@email-relay/api/context";
import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  parseAdminSessionCookie,
} from "@email-relay/api/admin-auth/cookie";
import { loginAdmin, logoutAdmin } from "@email-relay/api/admin-auth/service";
import { createMailboxRepository } from "@email-relay/api/mailboxes/repository";
import { appRouter } from "@email-relay/api/routers/index";
import { createAuth } from "@email-relay/auth";
import { createDb } from "@email-relay/db";
import { env } from "@email-relay/env/server";
import {
  buildGoogleAuthUrl,
  buildOutlookAuthUrl,
  createOutlookSubscription,
  createMailboxCredentialStore,
  exchangeGoogleCode,
  exchangeOutlookCode,
  getOutlookProfile,
  getGoogleProfile,
  listOutlookFolders,
  listGoogleLabels,
  parseOutlookOauthState,
  parseOauthState,
  signOutlookOauthState,
  signOauthState,
  startGmailWatch,
} from "@email-relay/mail";
import { syncAlert } from "@email-relay/db/schema/mail";
import { outlookMailboxState } from "@email-relay/db/schema/outlook";
import { gmailMailboxState } from "@email-relay/db/schema/provider";
import { toSyncAlertInput } from "@email-relay/api/operations/alerts";
import { handleMailQueue } from "./mail/queue";
import { handleGmailWebhook } from "./mail/gmail-webhook";
import { handleOutlookWebhook } from "./mail/outlook-webhook";
import { handleScheduled } from "./mail/scheduled";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

const app = new Hono<{ Bindings: Env }>();

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

app.get("/oauth/gmail/start", async (c) => {
  const state = await signOauthState(c.env.MAILBOX_OAUTH_STATE_SECRET, {
    provider: "gmail",
    redirectTo: c.req.query("redirectTo") ?? "/mailboxes",
  });

  return c.redirect(
    buildGoogleAuthUrl({
      clientId: c.env.GOOGLE_CLIENT_ID,
      redirectUri: c.env.GOOGLE_OAUTH_REDIRECT_URL,
      state,
    }),
  );
});

app.get("/oauth/gmail/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.text("Missing Gmail OAuth callback params", 400);
  }

  try {
    await parseOauthState(c.env.MAILBOX_OAUTH_STATE_SECRET, state);

    const tokens = await exchangeGoogleCode({
      code,
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      redirectUri: c.env.GOOGLE_OAUTH_REDIRECT_URL,
    });

    const profile = await getGoogleProfile(tokens.access_token);
    const labels = await listGoogleLabels(tokens.access_token);
    const db = createDb();
    const mailboxRepository = createMailboxRepository(db);
    const credentialStore = createMailboxCredentialStore(db, c.env.MAILBOX_CREDENTIALS_SECRET);

    const selectedLabels = labels.filter((label) => label.id === "INBOX");
    const mailboxRecord = await mailboxRepository.createGmailMailbox({
      address: profile.emailAddress,
      selectedLabels,
    });

    await credentialStore.saveOauthTokens({
      mailboxId: mailboxRecord.id,
      provider: "gmail",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope,
      tokenType: tokens.token_type,
    });

    // Gmail watch requires the Pub/Sub topic to grant publish rights to
    // gmail-api-push@system.gserviceaccount.com. If that is not configured the
    // call returns 403, but the mailbox itself is already usable: cron retries
    // the watch renewal every 15 minutes and history/poll sync still works.
    // Failing the whole callback here would strand a fully-created mailbox
    // behind an opaque 500, so the error is recorded as an alert instead.
    try {
      const watch = await startGmailWatch(
        tokens.access_token,
        c.env.GOOGLE_GMAIL_PUBSUB_TOPIC,
        selectedLabels.map((label) => label.id),
      );

      await db
        .insert(gmailMailboxState)
        .values({
          mailboxId: mailboxRecord.id,
          gmailAddress: profile.emailAddress,
          lastHistoryId: watch.historyId,
          watchExpirationAt: new Date(Number(watch.expiration)),
          watchStatus: "active",
        })
        .onConflictDoUpdate({
          target: gmailMailboxState.mailboxId,
          set: {
            gmailAddress: profile.emailAddress,
            lastHistoryId: watch.historyId,
            watchExpirationAt: new Date(Number(watch.expiration)),
            watchStatus: "active",
            updatedAt: new Date(),
          },
        });
    } catch (watchError) {
      const message = watchError instanceof Error ? watchError.message : String(watchError);
      console.error("Gmail watch registration failed", message);

      await db.insert(syncAlert).values(
        toSyncAlertInput({
          mailboxId: mailboxRecord.id,
          category: "temporary",
          detail:
            `${profile.emailAddress} 已接入，但 Gmail watch 注册失败：${message}。` +
            `请确认 Pub/Sub topic ${c.env.GOOGLE_GMAIL_PUBSUB_TOPIC} 已将发布权限授予 ` +
            `gmail-api-push@system.gserviceaccount.com。定时任务会自动重试续订。`,
        }),
      );
    }

    // The initial pull runs regardless: it does not depend on watch/push.
    await c.env.MAIL_SYNC_QUEUE.send({
      provider: "gmail",
      mailboxId: mailboxRecord.id,
      reason: "gmail-initial",
    });

    return c.redirect(`${c.env.CORS_ORIGIN}/mailboxes/${mailboxRecord.id}`);
  } catch (error) {
    // Surface the actual reason instead of a bare 500. Every step above can fail
    // for a distinct, actionable reason (expired state, bad client secret,
    // revoked grant), and none of them were previously distinguishable.
    const message = error instanceof Error ? error.message : String(error);
    console.error("Gmail OAuth callback failed", message);
    return c.text(`Gmail 接入失败：${message}`, 502);
  }
});

app.get("/oauth/outlook/start", async (c) => {
  const state = await signOutlookOauthState(c.env.MAILBOX_OAUTH_STATE_SECRET, {
    provider: "outlook",
    redirectTo: c.req.query("redirectTo") ?? "/mailboxes",
  });

  return c.redirect(
    buildOutlookAuthUrl({
      clientId: c.env.MICROSOFT_CLIENT_ID,
      redirectUri: c.env.MICROSOFT_OAUTH_REDIRECT_URL,
      state,
    }),
  );
});

app.get("/oauth/outlook/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.text("Missing Outlook OAuth params", 400);
  }

  try {
    await parseOutlookOauthState(c.env.MAILBOX_OAUTH_STATE_SECRET, state);

    const tokens = await exchangeOutlookCode({
      code,
      clientId: c.env.MICROSOFT_CLIENT_ID,
      clientSecret: c.env.MICROSOFT_CLIENT_SECRET,
      redirectUri: c.env.MICROSOFT_OAUTH_REDIRECT_URL,
    });

    const profile = await getOutlookProfile(tokens.access_token);
    const folders = await listOutlookFolders(tokens.access_token);
    const db = createDb();
    const mailboxRepository = createMailboxRepository(db);
    const credentialStore = createMailboxCredentialStore(db, c.env.MAILBOX_CREDENTIALS_SECRET);
    const mailboxRecord = await mailboxRepository.createOutlookMailbox({
      address: profile.emailAddress,
      selectedFolders: folders,
    });

    await credentialStore.saveOauthTokens({
      mailboxId: mailboxRecord.id,
      provider: "outlook",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope,
      tokenType: tokens.token_type,
    });

    // As with Gmail watch: the Graph subscription is a push optimisation, and
    // cron renews it every 15 minutes. A failure here must not discard an
    // otherwise working mailbox.
    try {
      const subscription = await createOutlookSubscription(tokens.access_token, {
        notificationUrl: `${c.env.BETTER_AUTH_URL}/webhooks/outlook/notifications`,
        clientState: c.env.MICROSOFT_NOTIFICATION_SECRET,
        resource: "/me/messages",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await db
        .insert(outlookMailboxState)
        .values({
          mailboxId: mailboxRecord.id,
          outlookAddress: profile.emailAddress,
          subscriptionId: subscription.id,
          subscriptionResource: subscription.resource,
          subscriptionExpiresAt: new Date(subscription.expirationDateTime),
        })
        .onConflictDoUpdate({
          target: outlookMailboxState.mailboxId,
          set: {
            outlookAddress: profile.emailAddress,
            subscriptionId: subscription.id,
            subscriptionResource: subscription.resource,
            subscriptionExpiresAt: new Date(subscription.expirationDateTime),
            updatedAt: new Date(),
          },
        });
    } catch (subscriptionError) {
      const message =
        subscriptionError instanceof Error
          ? subscriptionError.message
          : String(subscriptionError);
      console.error("Outlook subscription registration failed", message);

      await db.insert(syncAlert).values(
        toSyncAlertInput({
          mailboxId: mailboxRecord.id,
          category: "temporary",
          detail:
            `${profile.emailAddress} 已接入，但 Graph 订阅注册失败：${message}。` +
            `定时任务会自动重试续订。`,
        }),
      );
    }

    await c.env.MAIL_SYNC_QUEUE.send({
      provider: "outlook",
      mailboxId: mailboxRecord.id,
      reason: "outlook-initial",
    });

    return c.redirect(`${c.env.CORS_ORIGIN}/mailboxes/${mailboxRecord.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Outlook OAuth callback failed", message);
    return c.text(`Outlook 接入失败：${message}`, 502);
  }
});

app.post("/webhooks/gmail/push", async (c) => handleGmailWebhook(c.req.raw, c.env));
app.all("/webhooks/outlook/notifications", async (c) => handleOutlookWebhook(c.req.raw, c.env));

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

export default {
  fetch: app.fetch,
  queue: handleMailQueue,
  scheduled: handleScheduled,
};
