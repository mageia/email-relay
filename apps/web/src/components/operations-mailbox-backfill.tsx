import { Card, CardContent, CardHeader, CardTitle } from "@email-relay/ui/components/card";
import { useState } from "react";

import BackfillForm from "@/components/backfill-form";

type Mailbox = {
  id: string;
  address?: string;
  provider: string;
  status: string;
};

export type MailboxBackfillPayload = {
  mailboxId: string;
  rangeStart: string;
  rangeEnd: string;
};

export default function OperationsMailboxBackfillSection({
  mailboxes,
  onBackfill,
}: {
  mailboxes: Mailbox[];
  onBackfill: (payload: MailboxBackfillPayload) => Promise<void>;
}) {
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const handleSubmit = async (mailboxId: string, value: { rangeStart: string; rangeEnd: string }) => {
    setPending((prev) => ({ ...prev, [mailboxId]: true }));
    try {
      await onBackfill({ mailboxId, ...value });
    } finally {
      setPending((prev) => ({ ...prev, [mailboxId]: false }));
    }
  };

  if (mailboxes.length === 0) {
    return <p className="text-sm text-muted-foreground">目前还没有可补拉的邮箱。</p>;
  }

  return (
    <div className="grid gap-4">
      {mailboxes.map((mailbox) => (
        <Card key={mailbox.id}>
          <CardHeader>
            <CardTitle>{mailbox.address ?? "(未知邮箱)"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {mailbox.provider} · {mailbox.status}
              </p>
              <div className="border-t pt-3">
                <BackfillForm
                  isSubmitting={Boolean(pending[mailbox.id])}
                  onSubmit={(value) => handleSubmit(mailbox.id, value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

