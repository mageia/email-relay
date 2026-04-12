import { Button } from "@email-relay/ui/components/button";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import { useMemo, useState } from "react";

export type ConnectImapValue = {
  email: string;
  username: string;
  password: string;
  host?: string;
  port?: number;
  secure?: boolean;
};

type ConnectImapFormState = {
  email: string;
  username: string;
  password: string;
  host: string;
  port: string;
  secure: boolean;
};

type ConnectImapFormErrors = Partial<Record<keyof ConnectImapFormState, string>>;

const HOST_PATTERN = /^(localhost|([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+)$/;
const MIN_PORT = 1;
const MAX_PORT = 65_535;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateConnectImapForm(value: ConnectImapFormState): ConnectImapFormErrors {
  const errors: ConnectImapFormErrors = {};

  if (!isValidEmail(value.email)) {
    errors.email = "请输入有效的邮箱地址";
  }

  if (!value.username.trim()) {
    errors.username = "请输入用户名";
  }

  if (!value.password.trim()) {
    errors.password = "请输入密码或应用专用密码";
  }

  if (value.host.trim() && !HOST_PATTERN.test(value.host.trim())) {
    errors.host = "请输入有效的 IMAP Host";
  }

  if (value.port.trim()) {
    const numericPort = Number(value.port);
    const isInteger = Number.isInteger(numericPort);
    if (!isInteger || numericPort < MIN_PORT || numericPort > MAX_PORT) {
      errors.port = "端口必须是 1-65535 的整数";
    }
  }

  return errors;
}

export default function ConnectImapForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (value: ConnectImapValue) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [value, setValue] = useState<ConnectImapFormState>({
    email: "",
    username: "",
    password: "",
    host: "",
    port: "",
    secure: true,
  });

  const errors = useMemo(() => validateConnectImapForm(value), [value]);
  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <form
      className="space-y-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (hasErrors) {
          return;
        }

        void onSubmit({
          email: value.email.trim(),
          username: value.username.trim(),
          password: value.password,
          host: value.host.trim() || undefined,
          port: value.port.trim() ? Number(value.port) : undefined,
          secure: value.secure,
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="email">邮箱地址</Label>
        <Input
          aria-invalid={Boolean(errors.email)}
          id="email"
          value={value.email}
          onChange={(event) => setValue((current) => ({ ...current, email: event.target.value }))}
        />
        {errors.email ? <p className="text-xs text-red-500">{errors.email}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">用户名</Label>
        <Input
          aria-invalid={Boolean(errors.username)}
          id="username"
          value={value.username}
          onChange={(event) => setValue((current) => ({ ...current, username: event.target.value }))}
        />
        {errors.username ? <p className="text-xs text-red-500">{errors.username}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码 / 应用专用密码</Label>
        <Input
          aria-invalid={Boolean(errors.password)}
          id="password"
          type="password"
          value={value.password}
          onChange={(event) => setValue((current) => ({ ...current, password: event.target.value }))}
        />
        {errors.password ? <p className="text-xs text-red-500">{errors.password}</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="host">手动 Host（可选）</Label>
          <Input
            aria-invalid={Boolean(errors.host)}
            id="host"
            value={value.host}
            onChange={(event) => setValue((current) => ({ ...current, host: event.target.value }))}
          />
          {errors.host ? <p className="text-xs text-red-500">{errors.host}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="port">手动 Port（可选）</Label>
          <Input
            aria-invalid={Boolean(errors.port)}
            id="port"
            inputMode="numeric"
            type="number"
            value={value.port}
            onChange={(event) => setValue((current) => ({ ...current, port: event.target.value }))}
          />
          {errors.port ? <p className="text-xs text-red-500">{errors.port}</p> : null}
        </div>
      </div>
      <Button type="submit" disabled={isSubmitting || hasErrors}>
        {isSubmitting ? "验证中..." : "验证并连接 IMAP"}
      </Button>
    </form>
  );
}
