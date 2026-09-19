import { Button } from "@email-relay/ui/components/button";
import Field from "@email-relay/ui/components/field";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import { PanelBody } from "@email-relay/ui/components/panel";
import { ExternalLinkIcon, InfoIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { findImapSetupHint } from "@/lib/imap-setup-hints";

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

  /* Surfaces the provider-specific requirement as soon as the domain is known.
     Most providers reject the account password over IMAP and need a separately
     generated app password, which is the single biggest cause of failed setup. */
  const hint = useMemo(() => findImapSetupHint(value.email), [value.email]);

  return (
    <form
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
      <PanelBody className="flex flex-col gap-3.5">
        {hint?.requiresAppPassword ? (
          <div className="flex items-start gap-2 rounded-sm border border-info-border bg-info-muted px-2.5 py-2">
            <InfoIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-brand" />
            <div className="min-w-0 text-[0.6875rem] leading-relaxed">
              <div className="font-medium text-foreground">
                该邮箱需要使用应用专用密码
              </div>
              {hint.note ? (
                <p className="mt-0.5 text-muted-foreground">{hint.note}</p>
              ) : null}
              {hint.appPasswordUrl ? (
                <a
                  href={hint.appPasswordUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-flex items-center gap-1 text-brand hover:underline"
                >
                  前往生成应用专用密码
                  <ExternalLinkIcon aria-hidden="true" className="size-3" />
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="grid gap-3.5 md:grid-cols-2">
          <Field id="email" label="邮箱地址" error={errors.email} required>
            <Input
              value={value.email}
              onChange={(event) =>
                setValue((current) => ({ ...current, email: event.target.value }))
              }
            />
          </Field>
          <Field id="username" label="用户名" error={errors.username} required>
            <Input
              value={value.username}
              onChange={(event) =>
                setValue((current) => ({ ...current, username: event.target.value }))
              }
            />
          </Field>
          <Field id="password" label="密码 / 应用专用密码" error={errors.password} required>
            <Input
              type="password"
              value={value.password}
              onChange={(event) =>
                setValue((current) => ({ ...current, password: event.target.value }))
              }
            />
          </Field>
          <Field
            id="host"
            label="手动 Host（可选）"
            error={errors.host}
            hint="留空时按 SRV 记录与常见前缀自动探测"
          >
            <Input
              value={value.host}
              onChange={(event) =>
                setValue((current) => ({ ...current, host: event.target.value }))
              }
            />
          </Field>
          <Field id="port" label="手动 Port（可选）" error={errors.port} hint="默认 993">
            <Input
              inputMode="numeric"
              type="number"
              value={value.port}
              onChange={(event) =>
                setValue((current) => ({ ...current, port: event.target.value }))
              }
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">连接选项</Label>
            {/* Native input: the Base UI Checkbox renders a <span
                role="checkbox">, which toggles twice when nested in a <label>. */}
            <Label className="flex h-7 cursor-pointer items-center gap-2 text-xs font-normal">
              <input
                type="checkbox"
                className="size-3.5 shrink-0 accent-brand"
                checked={value.secure}
                onChange={(event) =>
                  setValue((current) => ({ ...current, secure: event.target.checked }))
                }
              />
              启用 TLS
            </Label>
          </div>
        </div>
        <Button
          type="submit"
          variant="brand"
          className="self-start"
          disabled={isSubmitting || hasErrors}
        >
          {isSubmitting ? "验证中..." : "验证并连接 IMAP"}
        </Button>
      </PanelBody>
    </form>
  );
}
