import { describe, expect, it } from "vitest";

import { toSyncAlertInput } from "./alerts";

describe("toSyncAlertInput", () => {
  it("promotes auth-expired failures to high-severity alerts", () => {
    expect(
      toSyncAlertInput({
        mailboxId: "mailbox-1",
        category: "auth-expired",
        detail: "refresh token invalid",
      }),
    ).toMatchObject({
      severity: "high",
      title: "邮箱授权失效",
    });
  });
});
