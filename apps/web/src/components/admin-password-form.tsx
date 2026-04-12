import { Button } from "@email-relay/ui/components/button";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import { useForm } from "@tanstack/react-form";

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
    <div className="mx-auto mt-16 w-full max-w-md rounded-xl border p-6">
      <h1 className="text-2xl font-semibold">管理员登录</h1>
      <p className="mt-2 text-sm text-muted-foreground">输入系统管理员密码进入统一收件箱。</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          form.handleSubmit();
        }}
      >
        <form.Field name="password">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>管理员密码</Label>
              <Input
                id={field.name}
                type="password"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </div>
          )}
        </form.Field>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "登录中..." : "登录"}
        </Button>
      </form>
    </div>
  );
}
