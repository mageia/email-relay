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
