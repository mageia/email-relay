export function createGroupRepository(deps: {
  insert: (row: { id: string; name: string; kind: string; description?: string }) => Promise<void>;
  list: () => Promise<Array<{ id: string; name: string; kind: string; description?: string }>>;
}) {
  return {
    async create(input: { name: string; kind: string; description?: string }) {
      const row = {
        id: crypto.randomUUID(),
        ...input,
      };

      await deps.insert(row);
      return row;
    },
    async list() {
      return deps.list();
    },
  };
}
