import { createAuth } from "@email-relay/auth";
import type { Context as HonoContext } from "hono";

import type { Context } from "./context-type";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions): Promise<Context> {
  const session = (await createAuth().api.getSession({
    headers: context.req.raw.headers,
  })) as Context["session"];

  return {
    auth: null,
    session,
  };
}

export type { Context } from "./context-type";
