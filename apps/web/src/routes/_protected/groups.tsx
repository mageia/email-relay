import { Badge } from "@email-relay/ui/components/badge";
import EmptyState from "@email-relay/ui/components/empty-state";
import ErrorState from "@email-relay/ui/components/error-state";
import PageHeader from "@email-relay/ui/components/page-header";
import { Panel } from "@email-relay/ui/components/panel";
import { Skeleton } from "@email-relay/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@email-relay/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { toast } from "sonner";

import GroupForm, { type GroupFormValue } from "@/components/group-form";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/groups")({
  component: GroupsPage,
});

type Group = { id: string; name: string; kind: string; description?: string | null };

function GroupsPage() {
  const groups = useQuery(orpc.groups.list.queryOptions());
  const createGroup = useMutation({
    mutationFn: async (input: GroupFormValue) => client.groups.create(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.groups.list.queryKey() });
      await queryClient.invalidateQueries({ queryKey: orpc.inbox.listFilters.queryKey() });
      toast.success("分组已创建");
    },
  });

  const rows = (groups.data ?? []) as Group[];

  return (
    <>
      <PageHeader
        title="分组"
        description="把邮箱归入逻辑分组，便于批量补拉与筛选。"
      />

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
        <GroupForm
          isSubmitting={createGroup.isPending}
          onSubmit={async (value) => {
            await createGroup.mutateAsync(value);
          }}
        />

        <Panel className="min-w-0">
          {groups.isPending ? (
            <div className="flex flex-col gap-2 p-3.5">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-10" />
              ))}
            </div>
          ) : groups.isError ? (
            <ErrorState
              description="无法获取分组列表。"
              error={groups.error}
              onRetry={() => groups.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<UsersIcon />}
              title="还没有分组"
              description="创建分组后，可以在收件箱按分组筛选，也能一次为整组邮箱触发历史补拉。"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>分组</TableHead>
                  <TableHead className="w-28">类型</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>
                      <div className="font-medium">{group.name}</div>
                      {group.description ? (
                        <div className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                          {group.description}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge tone="outline">{group.kind}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Backfill lives on the operations page now, where one form
                          serves every group instead of one form per row. */}
                      <Link to="/operations" className="text-xs text-brand hover:underline">
                        补拉
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}
