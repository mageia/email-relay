import { Button } from "@email-relay/ui/components/button";
import Field from "@email-relay/ui/components/field";
import { Input } from "@email-relay/ui/components/input";
import { Panel, PanelBody } from "@email-relay/ui/components/panel";
import { useForm } from "@tanstack/react-form";
import { CircleAlertIcon, LockIcon } from "lucide-react";

export default function AdminPasswordForm({
  onLogin,
  isSubmitting,
  error,
}: {
  onLogin: (password: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}) {
  const form = useForm({
    defaultValues: {
      password: "",
    },
    onSubmit: async ({ value }) => onLogin(value.password),
  });

  return (
    <div className="mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-sm flex-col justify-center">
      <div className="mb-5 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-sm bg-brand text-[0.8125rem] font-semibold text-brand-foreground"
        >
          ER
        </span>
        <div>
          <div className="text-[0.9375rem] leading-tight font-semibold tracking-[-0.015em]">
            Email Relay
          </div>
          <div className="text-[0.6875rem] text-muted-foreground">管理控制台</div>
        </div>
      </div>

      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            form.handleSubmit();
          }}
        >
          <PanelBody className="flex flex-col gap-3.5">
            <div>
              <h1 className="text-sm font-semibold">管理员登录</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                输入系统管理员密码进入统一收件箱。
              </p>
            </div>

            <form.Field name="password">
              {(field) => (
                <Field id={field.name} label="管理员密码">
                  <Input
                    type="password"
                    placeholder="至少 12 位"
                    autoComplete="current-password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>

            {error ? (
              <p
                role="alert"
                className="flex items-start gap-1.5 rounded-sm border border-destructive-border bg-destructive-muted px-2.5 py-2 text-xs text-destructive"
              >
                <CircleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            ) : null}

            <Button type="submit" variant="brand" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "登录中..." : "登录"}
            </Button>

            <p className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
              <LockIcon aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
              <span>会话凭 HttpOnly cookie 维持，默认有效期 30 天。</span>
            </p>
          </PanelBody>
        </form>
      </Panel>
    </div>
  );
}
