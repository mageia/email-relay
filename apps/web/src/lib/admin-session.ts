import { env } from "@email-relay/env/web";

export type AdminSession = {
  authenticated: true;
  expiresAt: string;
};

export async function getAdminSession() {
  const response = await fetch(`${env.VITE_SERVER_URL}/admin/session`, {
    credentials: "include",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AdminSession;
}

export async function loginAdmin(password: string) {
  const response = await fetch(`${env.VITE_SERVER_URL}/admin/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ message: "登录失败" }))) as { message?: string };
    throw new Error(body.message ?? "登录失败");
  }
}

export async function logoutAdmin() {
  await fetch(`${env.VITE_SERVER_URL}/admin/logout`, {
    method: "POST",
    credentials: "include",
  });
}
