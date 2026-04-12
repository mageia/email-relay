import { asc, eq, or } from "drizzle-orm";
import { createDb } from "@email-relay/db";
import { imapFolderCursor, imapMailboxState } from "@email-relay/db/schema/imap";
import { mailbox, syncAlert, syncJob } from "@email-relay/db/schema/mail";
import { outlookMailboxState } from "@email-relay/db/schema/outlook";
import { gmailMailboxState } from "@email-relay/db/schema/provider";
import {
  fetchImapFolderMessages,
  nextUidWindow,
  createOutlookSubscription,
  extractHistoryMessageIds,
  getOutlookDeltaPage,
  getGmailHistoryPage,
  MailSyncPayloadSchema,
  MailSyncPayload,
  createMailboxCredentialStore,
  normalizeImapMessage,
  normalizeGmailMessage,
  normalizeOutlookMessage,
  startGmailWatch,
  upsertNormalizedMessage,
  classifySyncError,
  nextRetryDelaySeconds,
} from "@email-relay/mail";
import { toSyncAlertInput } from "@email-relay/api/operations/alerts";

async function fetchGmailMessages(
  accessToken: string,
  labelIds: string[],
): Promise<Array<{ id: string; historyId?: string } & Record<string, unknown>>> {
  const query = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  labelIds.forEach((labelId) => query.searchParams.append("labelIds", labelId));
  query.searchParams.set("maxResults", "50");

  const listResponse = await fetch(query, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!listResponse.ok) {
    throw new Error(`Gmail list failed: ${listResponse.status}`);
  }

  const listBody = (await listResponse.json()) as { messages?: Array<{ id: string }> };

  return Promise.all(
    (listBody.messages ?? []).map(async ({ id }) => {
      const detailResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!detailResponse.ok) {
        throw new Error(`Gmail get failed: ${detailResponse.status}`);
      }

      return (await detailResponse.json()) as { id: string; historyId?: string } & Record<string, unknown>;
    }),
  );
}

async function fetchGmailMessage(accessToken: string, id: string) {
  const detailResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!detailResponse.ok) {
    throw new Error(`Gmail get failed: ${detailResponse.status}`);
  }

  return detailResponse.json();
}

const SYNC_REASON_TO_JOB_TYPE: Record<MailSyncPayload["reason"], "history-backfill" | undefined> = {
  "gmail-initial": undefined,
  "gmail-history": undefined,
  "gmail-renew-watch": undefined,
  "gmail-backfill": "history-backfill",
  "outlook-initial": undefined,
  "outlook-delta": undefined,
  "outlook-renew-subscription": undefined,
  "outlook-backfill": "history-backfill",
  "imap-initial": undefined,
  "imap-poll": undefined,
  "imap-backfill": "history-backfill",
};

type SyncJobRow = ReturnType<typeof syncJob.$inferSelect>[number];

async function claimSyncJob(db: ReturnType<typeof createDb>, payload: MailSyncPayload) {
  const jobType = SYNC_REASON_TO_JOB_TYPE[payload.reason];
  if (!jobType) {
    return null;
  }

  const [job] = await db
    .select()
    .from(syncJob)
    .where(
      eq(syncJob.mailboxId, payload.mailboxId),
      eq(syncJob.type, jobType),
      or(eq(syncJob.status, "queued"), eq(syncJob.status, "retry-scheduled")),
    )
    .orderBy(asc(syncJob.createdAt))
    .limit(1);

  if (!job) {
    return null;
  }

  await db
    .update(syncJob)
    .set({
      status: "processing",
      startedAt: new Date(),
      nextAttemptAt: null,
    })
    .where(eq(syncJob.id, job.id));

  return job;
}

async function finalizeSyncJobSuccess(db: ReturnType<typeof createDb>, job: SyncJobRow | null) {
  if (!job) {
    return;
  }

  await db
    .update(syncJob)
    .set({
      status: "completed",
      finishedAt: new Date(),
      nextAttemptAt: null,
    })
    .where(eq(syncJob.id, job.id));
}

async function handleSyncJobFailure(
  db: ReturnType<typeof createDb>,
  job: SyncJobRow | null,
  payload: MailSyncPayload,
  rawError: unknown,
) {
  const error = rawError instanceof Error ? rawError : new Error(String(rawError));
  const classification = classifySyncError(error);

  if (job) {
    const retryCount = (job.retryCount ?? 0) + 1;
    await db
      .update(syncJob)
      .set({
        status: classification.retryable ? "retry-scheduled" : "failed",
        retryCount,
        errorCategory: classification.category,
        errorMessage: error.message,
        nextAttemptAt: classification.retryable
          ? new Date(Date.now() + nextRetryDelaySeconds(retryCount) * 1000)
          : null,
        finishedAt: classification.retryable ? null : new Date(),
      })
      .where(eq(syncJob.id, job.id));
  }

  if (!classification.retryable) {
    await db.insert(syncAlert).values(
      toSyncAlertInput({
        mailboxId: job?.mailboxId ?? payload.mailboxId,
        groupId: job?.groupId ?? undefined,
        category: classification.category,
        detail: `${payload.provider} ${payload.reason} failed: ${error.message}`,
      }),
    );
  }
}

type QueueMessage = MessageBatch<unknown>["messages"][number];

async function ackWithSuccess(
  db: ReturnType<typeof createDb>,
  job: SyncJobRow | null,
  message: QueueMessage,
) {
  await finalizeSyncJobSuccess(db, job);
  await message.ack();
}

export async function handleMailQueue(batch: MessageBatch<unknown>, env: Env) {
  const db = createDb();
  const credentialStore = createMailboxCredentialStore(db, env.MAILBOX_CREDENTIALS_SECRET);

  for (const message of batch.messages) {
    const payload = MailSyncPayloadSchema.parse(message.body);
    let job: SyncJobRow | null = null;
    const ackSuccess = async () => ackWithSuccess(db, job, message);

    try {
      if (payload.provider === "imap") {
        const mailboxes = await db.select().from(mailbox);
        const mailboxRow = mailboxes.find((entry: { id: string }) => entry.id === payload.mailboxId);

        if (!mailboxRow) {
          await message.ack();
          continue;
        }

        job ||= await claimSyncJob(db, payload);

        const imapStates = await db.select().from(imapMailboxState);
        const state = imapStates.find((entry: { mailboxId: string }) => entry.mailboxId === payload.mailboxId);
        if (!state) {
          throw new Error(`Missing IMAP state for ${payload.mailboxId}`);
        }

        const credentials = await credentialStore.readOauthTokens(payload.mailboxId);
        if (!credentials?.accessToken) {
          throw new Error(`Missing IMAP credentials for ${payload.mailboxId}`);
        }

        const selectedFolders = payload.folderIds ?? (JSON.parse(mailboxRow.selectedFoldersJson) as string[]);
        const cursors = await db.select().from(imapFolderCursor);
        for (const folderId of selectedFolders) {
          const cursor = [...cursors]
            .reverse()
            .find(
              (entry: { mailboxId: string; folderId: string; lastSeenUid?: number | null }) =>
                entry.mailboxId === payload.mailboxId && entry.folderId === folderId,
            );
          const searchWindow = nextUidWindow({
            lastSeenUid: cursor?.lastSeenUid ?? null,
          });
          const records = await fetchImapFolderMessages({
            host: state.host,
            port: state.port,
            secure: state.secure,
            username: state.username,
            password: credentials.accessToken,
            folderId,
            uidSearch: searchWindow.search,
            limit: 50,
          });

          for (const record of records) {
            const normalized = await normalizeImapMessage(record);
            await upsertNormalizedMessage(db, {
              mailboxId: payload.mailboxId,
              ...normalized,
            });
          }

          const lastSeenUid =
            records.length > 0
              ? (records[records.length - 1]?.uid ?? null)
              : (cursor?.lastSeenUid ?? null);

          await db.insert(imapFolderCursor).values({
            mailboxId: payload.mailboxId,
            folderId,
            uidValidity: null,
            lastSeenUid,
            lastPolledAt: new Date(),
          });
        }

        await ackSuccess();
        continue;
      }

      if (payload.provider === "outlook") {
        const mailboxes = await db.select().from(mailbox);
        const mailboxRow = mailboxes.find((entry: { id: string }) => entry.id === payload.mailboxId);

        if (!mailboxRow) {
          await message.ack();
          continue;
        }

        job ||= await claimSyncJob(db, payload);

        const credentials = await credentialStore.readOauthTokens(payload.mailboxId);
        if (!credentials?.accessToken) {
          throw new Error(`Missing Outlook credentials for ${payload.mailboxId}`);
        }

        if (payload.reason === "outlook-renew-subscription") {
          const renewed = await createOutlookSubscription(credentials.accessToken, {
            notificationUrl: `${env.BETTER_AUTH_URL}/webhooks/outlook/notifications`,
            clientState: env.MICROSOFT_NOTIFICATION_SECRET,
            resource: "/me/messages",
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });

          await db
            .insert(outlookMailboxState)
            .values({
              mailboxId: payload.mailboxId,
              outlookAddress: mailboxRow.address,
              subscriptionId: renewed.id,
              subscriptionResource: renewed.resource,
              subscriptionExpiresAt: new Date(renewed.expirationDateTime),
            })
            .onConflictDoUpdate({
              target: outlookMailboxState.mailboxId,
              set: {
                outlookAddress: mailboxRow.address,
                subscriptionId: renewed.id,
                subscriptionResource: renewed.resource,
                subscriptionExpiresAt: new Date(renewed.expirationDateTime),
                updatedAt: new Date(),
              },
            });

          await ackSuccess();
          continue;
        }

        const deltaPage = await getOutlookDeltaPage({
          accessToken: credentials.accessToken,
          deltaLink: payload.deltaLink,
        });

        for (const graphMessage of deltaPage.value) {
          if (!graphMessage.id) {
            continue;
          }

          const normalized = normalizeOutlookMessage(graphMessage);
          await upsertNormalizedMessage(db, {
            mailboxId: payload.mailboxId,
            ...normalized,
          });
        }

        await db
          .insert(outlookMailboxState)
          .values({
            mailboxId: payload.mailboxId,
            outlookAddress: mailboxRow.address,
            deltaLink: deltaPage["@odata.deltaLink"] ?? payload.deltaLink ?? null,
            lastDeltaSyncAt: new Date(),
          })
          .onConflictDoUpdate({
            target: outlookMailboxState.mailboxId,
            set: {
              outlookAddress: mailboxRow.address,
              deltaLink: deltaPage["@odata.deltaLink"] ?? payload.deltaLink ?? null,
              lastDeltaSyncAt: new Date(),
              updatedAt: new Date(),
            },
          });

        if (deltaPage["@odata.nextLink"]) {
          await env.MAIL_SYNC_QUEUE.send({
            provider: "outlook",
            mailboxId: payload.mailboxId,
            reason: "outlook-delta",
            deltaLink: deltaPage["@odata.nextLink"],
          });
        }

        await ackSuccess();
        continue;
      }

      if (payload.provider !== "gmail") {
        await ackSuccess();
        continue;
      }

      const mailboxes = await db.select().from(mailbox);
      const mailboxRow = mailboxes.find((entry: { id: string }) => entry.id === payload.mailboxId);

      if (!mailboxRow) {
        await message.ack();
        continue;
      }

      job ||= await claimSyncJob(db, payload);

      const credentials = await credentialStore.readOauthTokens(payload.mailboxId);
      if (!credentials?.accessToken) {
        throw new Error(`Missing Gmail credentials for ${payload.mailboxId}`);
      }

      const selectedLabels = JSON.parse(mailboxRow.selectedFoldersJson) as string[];
      const effectiveLabels = selectedLabels.length > 0 ? selectedLabels : ["INBOX"];

      if (payload.reason === "gmail-renew-watch") {
        const watch = await startGmailWatch(
          credentials.accessToken,
          env.GOOGLE_GMAIL_PUBSUB_TOPIC,
          effectiveLabels,
        );

        await db
          .insert(gmailMailboxState)
          .values({
            mailboxId: payload.mailboxId,
            gmailAddress: mailboxRow.address,
            lastHistoryId: watch.historyId,
            watchExpirationAt: new Date(Number(watch.expiration)),
            watchStatus: "active",
          })
          .onConflictDoUpdate({
            target: gmailMailboxState.mailboxId,
            set: {
              gmailAddress: mailboxRow.address,
              lastHistoryId: watch.historyId,
              watchExpirationAt: new Date(Number(watch.expiration)),
              watchStatus: "active",
              updatedAt: new Date(),
            },
          });

        await ackSuccess();
        continue;
      }

      if (payload.reason === "gmail-history") {
        const states = await db.select().from(gmailMailboxState);
        const state = states.find((entry: { mailboxId: string; lastHistoryId?: string | null }) => entry.mailboxId === payload.mailboxId);
        const startHistoryId = payload.historyId ?? state?.lastHistoryId;
        if (!startHistoryId) {
          throw new Error(`Missing Gmail history cursor for ${payload.mailboxId}`);
        }

        const historyPage = await getGmailHistoryPage({
          accessToken: credentials.accessToken,
          startHistoryId,
          pageToken: payload.pageToken,
          labelId: effectiveLabels.length === 1 ? effectiveLabels[0] : undefined,
        });

        const messageIds = extractHistoryMessageIds(historyPage);
        for (const id of messageIds) {
          const gmailMessage = await fetchGmailMessage(credentials.accessToken, id);
          const normalized = normalizeGmailMessage(gmailMessage);
          await upsertNormalizedMessage(db, {
            mailboxId: payload.mailboxId,
            ...normalized,
          });
        }

        await db
          .insert(gmailMailboxState)
          .values({
            mailboxId: payload.mailboxId,
            gmailAddress: mailboxRow.address,
            lastHistoryId: historyPage.historyId ?? startHistoryId,
            lastPartialSyncAt: new Date(),
          })
          .onConflictDoUpdate({
            target: gmailMailboxState.mailboxId,
            set: {
              gmailAddress: mailboxRow.address,
              lastHistoryId: historyPage.historyId ?? startHistoryId,
              lastPartialSyncAt: new Date(),
              updatedAt: new Date(),
            },
          });

        if (historyPage.nextPageToken) {
          await env.MAIL_SYNC_QUEUE.send({
            provider: "gmail",
            mailboxId: payload.mailboxId,
            reason: "gmail-history",
            historyId: startHistoryId,
            pageToken: historyPage.nextPageToken,
          });
        }

        await ackSuccess();
        continue;
      }

      const gmailMessages = await fetchGmailMessages(credentials.accessToken, effectiveLabels);

      for (const gmailMessage of gmailMessages) {
        const normalized = normalizeGmailMessage(gmailMessage);
        await upsertNormalizedMessage(db, {
          mailboxId: payload.mailboxId,
          ...normalized,
        });
      }

      await db
        .insert(gmailMailboxState)
        .values({
          mailboxId: payload.mailboxId,
          gmailAddress: mailboxRow.address,
          lastHistoryId: gmailMessages[0]?.historyId ?? null,
          lastFullSyncAt: new Date(),
        })
        .onConflictDoUpdate({
          target: gmailMailboxState.mailboxId,
          set: {
            gmailAddress: mailboxRow.address,
            lastHistoryId: gmailMessages[0]?.historyId ?? null,
            lastFullSyncAt: new Date(),
            updatedAt: new Date(),
          },
        });

      await ackSuccess();
      continue;
    } catch (rawError) {
      await handleSyncJobFailure(db, job, payload, rawError);
      await message.ack();
      continue;
    }
  }
}
