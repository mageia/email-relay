import alchemy from "alchemy";
import { D1Database, Queue, Vite, Worker } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "../../.env" });
config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("email-relay");

const db = await D1Database("database", {
  adopt: true,
  migrationsDir: "../../packages/db/src/migrations",
});

const mailSyncQueue = await Queue("mail-sync", {
  name: "email-relay-mail-sync",
  adopt: true,
});

export const web = await Vite("web", {
  adopt: true,
  cwd: "../../apps/web",
  assets: "dist",
  bindings: {
    VITE_SERVER_URL: alchemy.env.VITE_SERVER_URL!,
  },
});

export const server = await Worker("server", {
  adopt: true,
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  crons: ["0 */6 * * *", "*/15 * * * *"],
  bindings: {
    DB: db,
    MAIL_SYNC_QUEUE: mailSyncQueue,
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    ADMIN_BOOTSTRAP_PASSWORD: alchemy.secret.env.ADMIN_BOOTSTRAP_PASSWORD!,
    MAILBOX_CREDENTIALS_SECRET: alchemy.secret.env.MAILBOX_CREDENTIALS_SECRET!,
    MAILBOX_OAUTH_STATE_SECRET: alchemy.secret.env.MAILBOX_OAUTH_STATE_SECRET!,
    GOOGLE_CLIENT_ID: alchemy.env.GOOGLE_CLIENT_ID!,
    GOOGLE_CLIENT_SECRET: alchemy.secret.env.GOOGLE_CLIENT_SECRET!,
    GOOGLE_OAUTH_REDIRECT_URL: alchemy.env.GOOGLE_OAUTH_REDIRECT_URL!,
    GOOGLE_GMAIL_PUBSUB_TOPIC: alchemy.env.GOOGLE_GMAIL_PUBSUB_TOPIC!,
    GOOGLE_GMAIL_PUSH_TOKEN: alchemy.secret.env.GOOGLE_GMAIL_PUSH_TOKEN!,
    MICROSOFT_CLIENT_ID: alchemy.env.MICROSOFT_CLIENT_ID!,
    MICROSOFT_CLIENT_SECRET: alchemy.secret.env.MICROSOFT_CLIENT_SECRET!,
    MICROSOFT_OAUTH_REDIRECT_URL: alchemy.env.MICROSOFT_OAUTH_REDIRECT_URL!,
    MICROSOFT_NOTIFICATION_SECRET:
      alchemy.secret.env.MICROSOFT_NOTIFICATION_SECRET!,
  },
  eventSources: [
    {
      queue: mailSyncQueue,
      settings: {
        batchSize: 10,
        maxRetries: 5,
        retryDelay: 30,
      },
    },
  ],
  dev: {
    port: 3000,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
