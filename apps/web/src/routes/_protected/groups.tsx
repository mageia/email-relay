import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import BackfillForm from "@/components/backfill-form";
import GroupForm, { type GroupFormValue } from "@/components/group-form";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/groups")({
  component: GroupsPage,
});

function GroupsPage() {
  const groups = useQuery(orpc.groups.list.queryOptions());
  const createGroup = useMutation({
    mutationFn: async (input: GroupFormValue) =>
      client.groups.create(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.groups.list.queryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: orpc.inbox.listFilters.queryKey(),
      });
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <GroupForm
        isSubmitting={createGroup.isPending}
        onSubmit={async (value) => {
          await createGroup.mutateAsync(value);
        }}
      />
      <div className="rounded-xl border p-4">
        <h1 className="mb-4 text-xl font-semibold">分组</h1>
        <ul className="space-y-3">
          {(groups.data ?? []).map((group: { id: string; name: string; kind: string }) => (
            <li key={group.id} className="rounded-lg border p-3">
              <div className="font-medium">{group.name}</div>
              <div className="text-sm text-muted-foreground">{group.kind}</div>
              <div className="mt-3">
                <BackfillForm
                  isSubmitting={false}
                  onSubmit={async ({ rangeStart, rangeEnd }) => {
                    await client.operations.triggerGroupBackfill({
                      groupId: group.id,
                      rangeStart: new Date(`${rangeStart}T00:00:00.000Z`).toISOString(),
                      rangeEnd: new Date(`${rangeEnd}T00:00:00.000Z`).toISOString(),
                    });
                  }}
                />
              </div>
            </li>
          ))}
          {groups.data?.length === 0 ? <li className="text-sm text-muted-foreground">还没有分组</li> : null}
        </ul>
      </div>
    </div>
  );
}
