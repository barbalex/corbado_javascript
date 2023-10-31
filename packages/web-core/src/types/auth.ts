import type { CookiesDefinition } from "./common";

export interface IAuthResponse {
  shortSession: CookiesDefinition;
  emailLinkID: string;
}
