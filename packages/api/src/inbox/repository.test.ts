import { describe, expect, it } from "vitest";

import { createInboxRepository } from "./repository";

describe("createInboxRepository search", () => {
  it("searches messages through the FTS query when a search term is provided", async () => {
    const sqlCalls: string[] = [];
    const repository = createInboxRepository({
      execute: async (sql: string) => {
        sqlCalls.push(sql);
        return [];
      },
    } as any);

    await repository.searchMessages({ search: "invoice april" });

    expect(sqlCalls.some((sql) => sql.includes("mail_message_fts"))).toBe(true);
  });
});
