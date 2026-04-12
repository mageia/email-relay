import { Card, CardContent, CardHeader, CardTitle } from "@email-relay/ui/components/card";

export default function InboxEmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>收件箱还是空的</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>当前还没有同步到任何邮件。</p>
        <p>下一步接入 Gmail / Outlook / IMAP 后，这里会显示统一收件箱聚合结果。</p>
      </CardContent>
    </Card>
  );
}
