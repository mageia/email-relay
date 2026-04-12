export type AuthStore = {
  getPasswordHash: () => Promise<string | null>;
  setPasswordHash: (value: string) => Promise<void>;
  insertSession: (tokenHash: string, expiresAt: Date) => Promise<void>;
  getSession: (tokenHash: string) => Promise<{ expiresAt: Date } | null>;
  deleteSession: (tokenHash: string) => Promise<void>;
};

export type AdminSession = {
  authenticated: true;
  expiresAt: Date;
  adminConfigId: string;
};

export interface Context {
  adminSession: AdminSession | null;
  db: any;
  authStore: AuthStore;
  env: Record<string, unknown>;
}
