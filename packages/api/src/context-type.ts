export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

export type Session = {
  user: SessionUser;
} | null;

export interface Context {
  auth: null;
  session: Session;
}
