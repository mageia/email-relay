import { Button } from "@email-relay/ui/components/button";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import { useForm } from "@tanstack/react-form";

export type ConnectImapValue = {
  email: string;
  username: string;
  password: string;
  host?: string;
  port?: number;
  secure?: boolean;
};

export default function ConnectImapForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (value: ConnectImapValue) => Promise<void>;
  isSubmitting: boolean;
}) {
  const form = useForm({
    defaultValues: {
      email: "",
      username: "",
      password: "",
      host: "",
      port: 993,
      secure: true,
    },
    onSubmit: async ({ value }) =>
      onSubmit({
        ...value,
        host: value.host || undefined,
      }),
  });

  return (
    <form
      className="space-y-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="email">邮箱地址</Label>
        <Input
          id="email"
          value={form.state.values.email}
          onChange={(event) => form.setFieldValue("email", event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          id="username"
          value={form.state.values.username}
          onChange={(event) => form.setFieldValue("username", event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码 / 应用专用密码</Label>
        <Input
          id="password"
          type="password"
          value={form.state.values.password}
          onChange={(event) => form.setFieldValue("password", event.target.value)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="host">手动 Host（可选）</Label>
          <Input
            id="host"
            value={form.state.values.host}
            onChange={(event) => form.setFieldValue("host", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="port">手动 Port（可选）</Label>
          <Input
            id="port"
            type="number"
            value={String(form.state.values.port)}
            onChange={(event) => form.setFieldValue("port", Number(event.target.value))}
          />
        </div>
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "验证中..." : "验证并连接 IMAP"}
      </Button>
    </form>
  );
}
