import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { InferModel } from "drizzle-orm";
import { createDb } from "@email-relay/db";
import { imapFolderCursor, imapMailboxState } from "@email-relay/db/schema/imap";
import { mailbox, syncAlert, syncJob } from "@email-relay/db/schema/mail";
import { outlookMailboxState } from "@email-relay/db/schema/outlook";
import { gmailMailboxState } from "@email-relay/db/schema/provider";
import {
  buildGmailRangeQuery,
  fetchImapFolderMessages,
  nextUidWindow,
  createOutlookSubscription,
  extractHistoryMessageIds,
  getOutlookDeltaPage,
  getOutlookMessagesInRange,
  getGmailHistoryPage,
  MailSyncPayloadSchema,
  createMailboxCredentialStore,
  nextStateAfterFailure,
  nextStateAfterSuccess,
  normalizeImapMessage,
  normalizeGmailMessage,
  normalizeOutlookMessage,
  resolveSyncRange,
  startGmailWatch,
  upsertNormalizedMessage,
  classifySyncError,
} from "@email-relay/mail";
import type { MailSyncPayload } from "@email-relay/mail";
import { toSyncAlertInput } from "@email-relay/api/operations/alerts";

import { recordMailboxSyncSuccess, shouldRecordMailboxSyncSuccess } from "./sync-status";

async function fetchGmailMessages(
  accessToken: string,
  labelIds: string[],
  options: { query?: string; pageToken?: string } = {},
): Promise<{
  messages: Array<{ id: string; historyId?: string } & Record<string, unknown>>;
  nextPageToken?: string;
}> {
  const query = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  labelIds.forEach((labelId) => query.searchParams.append("labelIds", labelId));
  query.searchParams.set("maxResults", "50");
  if (options.query) {
    query.searchParams.set("q", options.query);
  }
  if (options.pageToken) {
    query.searchParams.set("pageToken", options.pageToken);
  }

  const listResponse = await fetch(query, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!listResponse.ok) {
    throw new Error(`Gmail list failed: ${listResponse.status}`);
  }

  const listBody = (await listResponse.json()) as {
    messages?: Array<{ id: string }>;
    nextPageToken?: string;
  };

  const messages = await Promise.all(
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

      return (await detailResponse.json()) as { id: string; historyId?: string } & Record<
        string,
        unknown
      >;
    }),
  );

  return { messages, nextPageToken: listBody.nextPageToken };
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

type SyncJobRow = InferModel<typeof syncJob, "select">;

async function claimSyncJob(db: ReturnType<typeof createDb>, payload: MailSyncPayload) {
  const jobType = SYNC_REASON_TO_JOB_TYPE[payload.reason];
  if (!jobType) {
    return null;
  }

  const range = resolveSyncRange(payload);
  const baseConditions = [
    eq(syncJob.mailboxId, payload.mailboxId),
    eq(syncJob.type, jobType),
    or(eq(syncJob.status, "queued"), eq(syncJob.status, "retry-scheduled")),
  ];

  // Prefer the job whose recorded range matches this payload. A group backfill
  // creates one job per mailbox and several may be open for the same mailbox, so
  // matching on mailbox+type alone could claim the wrong one.
  let job: SyncJobRow | undefined;

  if (range) {
    [job] = await db
      .select()
      .from(syncJob)
      .where(
        and(
          ...baseConditions,
          eq(syncJob.requestedRangeStart, range.rangeStart),
          eq(syncJob.requestedRangeEnd, range.rangeEnd),
        ),
      )
      .orderBy(asc(syncJob.createdAt))
      .limit(1);
  }

  // Fall back only to jobs with no recorded range (legacy or hand-inserted rows),
  // which would otherwise sit in "queued" forever. Jobs that do have a range are
  // deliberately excluded: claiming one whose range differs from this payload would
  // mark a different backfill complete without ever running it.
  if (!job) {
    [job] = await db
      .select()
      .from(syncJob)
      .where(
        and(
          ...baseConditions,
          isNull(syncJob.requestedRangeStart),
          isNull(syncJob.requestedRangeEnd),
        ),
      )
      .orderBy(asc(syncJob.createdAt))
      .limit(1);
  }

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
    .set(nextStateAfterSuccess({ hasPendingPage: false }))
    .where(eq(syncJob.id, job.id));
}

/**
 * Releases a job back to "queued" because this page enqueued a continuation.
 *
 * The job must not stay "processing": claimSyncJob only claims queued or
 * retry-scheduled rows, so the next page could neither claim it nor record a
 * failure against it, and the job would never reach a terminal state.
 */
async function releaseSyncJobForNextPage(
  db: ReturnType<typeof createDb>,
  job: SyncJobRow | null,
) {
  if (!job) {
    return;
  }

  await db
    .update(syncJob)
    .set(nextStateAfterSuccess({ hasPendingPage: true }))
    .where(eq(syncJob.id, job.id));
}

/**
 * Records the failure and reports whether the message should be retried by the
 * queue. Returning the decision (rather than always acking) is what lets the
 * Cloudflare Queues retry budget actually apply.
 */
async function handleSyncJobFailure(
  db: ReturnType<typeof createDb>,
  job: SyncJobRow | null,
  payload: MailSyncPayload,
  rawError: unknown,
  attempt: number,
): Promise<{ retry: boolean; delaySeconds: number }> {
  const error = rawError instanceof Error ? rawError : new Error(String(rawError));
  const classification = classifySyncError(error);
  const attemptCount = Math.max(attempt, job ? (job.retryCount ?? 0) + 1 : 1);
  const transition = nextStateAfterFailure({
    attemptCount,
    retryable: classification.retryable,
    category: classification.category,
    message: error.message,
  });
  const shouldRetry = transition.retry;

  if (job) {
    // "retry-scheduled" here means "the queue owns the next attempt". nextAttemptAt
    // is recorded so cron can detect a lost message, but cron only acts once
    // STUCK_JOB_GRACE_SECONDS has elapsed.
    await db.update(syncJob).set(transition.patch).where(eq(syncJob.id, job.id));
  }

  if (!shouldRetry) {
    const reasonSuffix = transition.exhausted && classification.retryable
      ? ` (gave up after ${attemptCount} attempts)`
      : "";

    await db.insert(syncAlert).values(
      toSyncAlertInput({
        mailboxId: job?.mailboxId ?? payload.mailboxId,
        groupId: job?.groupId ?? undefined,
        category: classification.category,
        detail: `${payload.provider} ${payload.reason} failed: ${error.message}${reasonSuffix}`,
      }),
    );
  }

  return { retry: shouldRetry, delaySeconds: transition.delaySeconds };
}

type QueueMessage = MessageBatch<unknown>["messages"][number];

async function ackWithSuccess(
  db: ReturnType<typeof createDb>,
  job: SyncJobRow | null,
  payload: MailSyncPayload,
  message: QueueMessage,
  /**
   * True when this page enqueued a continuation, so the job is not finished yet
   * and is released for the next page to claim rather than marked complete.
   */
  hasPendingPage = false,
) {
  if (shouldRecordMailboxSyncSuccess(payload)) {
    await recordMailboxSyncSuccess(db, payload.mailboxId);
  }

  if (hasPendingPage) {
    await releaseSyncJobForNextPage(db, job);
  } else {
    await finalizeSyncJobSuccess(db, job);
  }

  await message.ack();
}

export async function handleMailQueue(batch: MessageBatch<unknown>, env: Env) {
  const db = createDb();
  const credentialStore = createMailboxCredentialStore(db, env.MAILBOX_CREDENTIALS_SECRET);
  const oauthClients = {
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    microsoftClientId: env.MICROSOFT_CLIENT_ID,
    microsoftClientSecret: env.MICROSOFT_CLIENT_SECRET,
  };

  for (const message of batch.messages) {
    const parsed = MailSyncPayloadSchema.safeParse(message.body);
    if (!parsed.success) {
      // Malformed payloads will never become valid; retrying them would loop until
      // the queue gives up.
      console.error("Discarding malformed mail sync payload", parsed.error.message);
      await message.ack();
      continue;
    }

    const payload = parsed.data;
    const range = resolveSyncRange(payload);
    let job: SyncJobRow | null = null;
    const ackSuccess = async (hasPendingPage = false) =>
      ackWithSuccess(db, job, payload, message, hasPendingPage);

    try {
      if (payload.provider === "imap") {
        const [mailboxRow] = await db
          .select()
          .from(mailbox)
          .where(eq(mailbox.id, payload.mailboxId))
          .limit(1);

        if (!mailboxRow) {
          await message.ack();
          continue;
        }

        job ||= await claimSyncJob(db, payload);

        const [state] = await db
          .select()
          .from(imapMailboxState)
          .where(eq(imapMailboxState.mailboxId, payload.mailboxId))
          .limit(1);
        if (!state) {
          throw new Error(`Missing IMAP state for ${payload.mailboxId}`);
        }

        const password = await credentialStore.getUsableAccessToken({
          mailboxId: payload.mailboxId,
          provider: "imap",
          credentials: oauthClients,
        });
        if (!password) {
          throw new Error(`Missing IMAP credentials for ${payload.mailboxId}`);
        }

        const selectedFolders =
          payload.folderIds ?? (JSON.parse(mailboxRow.selectedFoldersJson) as string[]);

        // During a ranged backfill the payload carries its own paging cursor so a
        // large date window is not truncated to a single page.
        const backfillAfterUid =
          range && payload.pageToken ? Number(payload.pageToken) : null;
        // Every folder with remaining pages must be tracked. Keeping only the last
        // one would silently abandon the others' unread messages.
        const pendingFolders: Array<{ folderId: string; lastUid: number }> = [];

        for (const folderId of selectedFolders) {
          const [cursor] = await db
            .select()
            .from(imapFolderCursor)
            .where(
              and(
                eq(imapFolderCursor.mailboxId, payload.mailboxId),
                eq(imapFolderCursor.folderId, folderId),
              ),
            )
            .limit(1);

          // A backfill searches the requested date window; a poll walks forward
          // from the stored UID cursor.
          const searchWindow = nextUidWindow({
            lastSeenUid: cursor?.lastSeenUid ?? null,
            range,
          });
          const result = await fetchImapFolderMessages({
            host: state.host,
            port: state.port,
            secure: state.secure,
            username: state.username,
            password,
            folderId,
            uidSearch: searchWindow.search,
            limit: 50,
            afterUid: Number.isFinite(backfillAfterUid) ? backfillAfterUid : null,
          });

          for (const record of result.messages) {
            const normalized = await normalizeImapMessage(record);
            await upsertNormalizedMessage(db, {
              mailboxId: payload.mailboxId,
              ...normalized,
            });
          }

          if (result.hasMore && result.lastUid !== null) {
            pendingFolders.push({ folderId, lastUid: result.lastUid });
          }

          const highestFetchedUid = result.messages.reduce<number | null>(
            (highest, record) =>
              typeof record.uid === "number" && (highest === null || record.uid > highest)
                ? record.uid
                : highest,
            null,
          );

          const now = new Date();

          if (highestFetchedUid === null) {
            // Nothing fetched; only record that the folder was polled.
            await db
              .insert(imapFolderCursor)
              .values({
                mailboxId: payload.mailboxId,
                folderId,
                uidValidity: cursor?.uidValidity ?? null,
                lastSeenUid: cursor?.lastSeenUid ?? null,
                lastPolledAt: now,
              })
              .onConflictDoUpdate({
                target: [imapFolderCursor.mailboxId, imapFolderCursor.folderId],
                set: { lastPolledAt: now, updatedAt: now },
              });
            continue;
          }

          // Advance via SQL max() so the cursor cannot move backwards. A backfill
          // deliberately reads older UIDs, and a concurrent poll may have already
          // stored a higher value; comparing in application memory would let one
          // overwrite the other and trigger a full re-download.
          await db
            .insert(imapFolderCursor)
            .values({
              mailboxId: payload.mailboxId,
              folderId,
              uidValidity: cursor?.uidValidity ?? null,
              lastSeenUid: highestFetchedUid,
              lastPolledAt: now,
            })
            .onConflictDoUpdate({
              target: [imapFolderCursor.mailboxId, imapFolderCursor.folderId],
              set: {
                lastSeenUid: sql`max(coalesce(${imapFolderCursor.lastSeenUid}, -1), ${highestFetchedUid})`,
                lastPolledAt: now,
                updatedAt: now,
              },
            });
        }

        // One continuation per folder: each carries its own UID cursor, so folders
        // paging at different depths cannot interfere with each other.
        for (const pending of pendingFolders) {
          await env.MAIL_SYNC_QUEUE.send({
            provider: "imap",
            mailboxId: payload.mailboxId,
            reason: payload.reason,
            folderIds: [pending.folderId],
            pageToken: String(pending.lastUid),
            rangeStart: payload.rangeStart,
            rangeEnd: payload.rangeEnd,
          });
        }

        await ackSuccess(pendingFolders.length > 0);
        continue;
      }

      if (payload.provider === "outlook") {
        const [mailboxRow] = await db
          .select()
          .from(mailbox)
          .where(eq(mailbox.id, payload.mailboxId))
          .limit(1);

        if (!mailboxRow) {
          await message.ack();
          continue;
        }

        job ||= await claimSyncJob(db, payload);

        const accessToken = await credentialStore.getUsableAccessToken({
          mailboxId: payload.mailboxId,
          provider: "outlook",
          credentials: oauthClients,
        });
        if (!accessToken) {
          throw new Error(`Missing Outlook credentials for ${payload.mailboxId}`);
        }

        if (payload.reason === "outlook-renew-subscription") {
          const renewed = await createOutlookSubscription(accessToken, {
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

        // Backfills cannot use delta: it only walks forward from a token and has no
        // date filter. Use the filtered messages endpoint instead.
        if (range) {
          const rangePage = await getOutlookMessagesInRange({
            accessToken,
            rangeStart: range.rangeStart,
            rangeEnd: range.rangeEnd,
            nextLink: payload.nextLink,
          });

          for (const graphMessage of rangePage.value) {
            if (!graphMessage.id) {
              continue;
            }

            const normalized = normalizeOutlookMessage(graphMessage);
            await upsertNormalizedMessage(db, {
              mailboxId: payload.mailboxId,
              ...normalized,
            });
          }

          const nextLink = rangePage["@odata.nextLink"];
          if (nextLink) {
            await env.MAIL_SYNC_QUEUE.send({
              provider: "outlook",
              mailboxId: payload.mailboxId,
              reason: "outlook-backfill",
              nextLink,
              rangeStart: payload.rangeStart,
              rangeEnd: payload.rangeEnd,
            });
          }

          await ackSuccess(Boolean(nextLink));
          continue;
        }

        const deltaPage = await getOutlookDeltaPage({
          accessToken,
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

      const [mailboxRow] = await db
        .select()
        .from(mailbox)
        .where(eq(mailbox.id, payload.mailboxId))
        .limit(1);

      if (!mailboxRow) {
        await message.ack();
        continue;
      }

      job ||= await claimSyncJob(db, payload);

      const accessToken = await credentialStore.getUsableAccessToken({
        mailboxId: payload.mailboxId,
        provider: "gmail",
        credentials: oauthClients,
      });
      if (!accessToken) {
        throw new Error(`Missing Gmail credentials for ${payload.mailboxId}`);
      }

      const selectedLabels = JSON.parse(mailboxRow.selectedFoldersJson) as string[];
      const effectiveLabels = selectedLabels.length > 0 ? selectedLabels : ["INBOX"];

      if (payload.reason === "gmail-renew-watch") {
        const watch = await startGmailWatch(
          accessToken,
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
        const [state] = await db
          .select()
          .from(gmailMailboxState)
          .where(eq(gmailMailboxState.mailboxId, payload.mailboxId))
          .limit(1);
        const startHistoryId = payload.historyId ?? state?.lastHistoryId;
        if (!startHistoryId) {
          throw new Error(`Missing Gmail history cursor for ${payload.mailboxId}`);
        }

        const historyPage = await getGmailHistoryPage({
          accessToken,
          startHistoryId,
          pageToken: payload.pageToken,
          labelId: effectiveLabels.length === 1 ? effectiveLabels[0] : undefined,
        });

        const messageIds = extractHistoryMessageIds(historyPage);
        for (const id of messageIds) {
          const gmailMessage = await fetchGmailMessage(accessToken, id);
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

        await ackSuccess(Boolean(historyPage.nextPageToken));
        continue;
      }

      // Gmail list sync: `gmail-initial` pulls the newest page, `gmail-backfill`
      // constrains the query to the admin-selected window.
      const gmailResult = await fetchGmailMessages(accessToken, effectiveLabels, {
        query: range ? buildGmailRangeQuery(range) : undefined,
        pageToken: payload.pageToken,
      });

      for (const gmailMessage of gmailResult.messages) {
        const normalized = normalizeGmailMessage(gmailMessage);
        await upsertNormalizedMessage(db, {
          mailboxId: payload.mailboxId,
          ...normalized,
        });
      }

      // A backfill reads historical mail, so its historyId must not overwrite the
      // live incremental cursor.
      if (!range) {
        await db
          .insert(gmailMailboxState)
          .values({
            mailboxId: payload.mailboxId,
            gmailAddress: mailboxRow.address,
            lastHistoryId: gmailResult.messages[0]?.historyId ?? null,
            lastFullSyncAt: new Date(),
          })
          .onConflictDoUpdate({
            target: gmailMailboxState.mailboxId,
            set: {
              gmailAddress: mailboxRow.address,
              lastHistoryId: gmailResult.messages[0]?.historyId ?? null,
              lastFullSyncAt: new Date(),
              updatedAt: new Date(),
            },
          });
      }

      // Only a ranged backfill pages through history. `gmail-initial` deliberately
      // stops after the first page: ongoing delivery is handled by watch/history,
      // and paging the whole mailbox on connect would be an unbounded crawl.
      const shouldPageGmail = Boolean(range && gmailResult.nextPageToken);
      if (shouldPageGmail) {
        await env.MAIL_SYNC_QUEUE.send({
          provider: "gmail",
          mailboxId: payload.mailboxId,
          reason: payload.reason,
          pageToken: gmailResult.nextPageToken,
          rangeStart: payload.rangeStart,
          rangeEnd: payload.rangeEnd,
        });
      }

      await ackSuccess(shouldPageGmail);
      continue;
    } catch (rawError) {
      // message.attempts is 1-based and counts the current delivery.
      const attempt = typeof message.attempts === "number" ? message.attempts : 1;
      const { retry, delaySeconds } = await handleSyncJobFailure(
        db,
        job,
        payload,
        rawError,
        attempt,
      );

      if (retry) {
        // Hand the message back to the queue so Cloudflare's retry budget applies.
        // The previous unconditional ack() made maxRetries dead configuration.
        message.retry({ delaySeconds });
      } else {
        await message.ack();
      }

      continue;
    }
  }
}
