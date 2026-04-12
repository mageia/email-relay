import { Card, CardContent, CardHeader, CardTitle } from "@email-relay/ui/components/card";
import { useState } from "react";

import BackfillForm from "@/components/backfill-form";

type Group = {
  id: string;
  name: string;
  kind: string;
};

export type GroupBackfillPayload = {
  groupId: string;
  rangeStart: string;
  rangeEnd: string;
};

export default function OperationsGroupBackfillSection({
  groups,
  onBackfill,
}: {
  groups: Group[];
  onBackfill: (payload: GroupBackfillPayload) => Promise<void>;
}) {
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const handleSubmit = async (groupId: string, value: { rangeStart: string; rangeEnd: string }) => {
    setPending((prev) => ({ ...prev, [groupId]: true }));
    try {
      await onBackfill({ groupId, ...value });
    } finally {
      setPending((prev) => ({ ...prev, [groupId]: false }));
    }
  };

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">当前还没有分组。</p>;
  }

  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <Card key={group.id}>
          <CardHeader>
            <CardTitle>{group.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{group.kind}</p>
              <div className="border-t pt-3">
                <BackfillForm
                  isSubmitting={Boolean(pending[group.id])}
                  onSubmit={(value) => handleSubmit(group.id, value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
