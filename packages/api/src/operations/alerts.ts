export function toSyncAlertInput(input: {
  mailboxId?: string;
  groupId?: string;
  category: "auth-expired" | "rate-limited" | "temporary" | "stale-sync";
  detail: string;
}) {
  const severity =
    input.category === "auth-expired"
      ? "high"
      : input.category === "stale-sync"
        ? "medium"
        : "low";

  const titleMap = {
    "auth-expired": "邮箱授权失效",
    "rate-limited": "同步遇到限流",
    temporary: "同步任务失败",
    "stale-sync": "邮箱长时间未同步",
  } as const;

  return {
    mailboxId: input.mailboxId,
    groupId: input.groupId,
    type: input.category,
    severity,
    status: "open",
    title: titleMap[input.category],
    detail: input.detail,
  };
}
