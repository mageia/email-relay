import { Button } from "@email-relay/ui/components/button";
import { env } from "@email-relay/env/web";

export default function ConnectGmailButton() {
  return (
    <Button
      onClick={() => {
        window.location.href = `${env.VITE_SERVER_URL}/oauth/gmail/start?redirectTo=/mailboxes`;
      }}
    >
      连接 Gmail
    </Button>
  );
}
