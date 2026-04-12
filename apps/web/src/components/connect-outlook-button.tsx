import { Button } from "@email-relay/ui/components/button";
import { env } from "@email-relay/env/web";

export default function ConnectOutlookButton() {
  return (
    <Button
      variant="outline"
      onClick={() => {
        window.location.href = `${env.VITE_SERVER_URL}/oauth/outlook/start?redirectTo=/mailboxes`;
      }}
    >
      连接 Outlook
    </Button>
  );
}
