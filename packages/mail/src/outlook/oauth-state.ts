import { parseOauthState, signOauthState } from "../gmail/oauth-state";

export function signOutlookOauthState(secret: string, payload: Record<string, string>) {
  return signOauthState(secret, payload);
}

export function parseOutlookOauthState(secret: string, state: string) {
  return parseOauthState(secret, state);
}
