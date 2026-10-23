/** The version of `@nusgaops/sgauth` in use, as published to npm. */
export const version: string = __SGAUTH_SDK_VERSION__;

export { createSgauthClient, getSession } from "./session/client.js";
export type { SgauthClient } from "./session/client.js";
export { SgauthConfigError } from "./session/config.js";
export type {
  GetSessionInput,
  HeadersLike,
  SgaPosition,
  SgaSession,
  SgaSessionErrorInfo,
  SgaSessionErrorKind,
  SgaSessionInfo,
  SgaUser,
  SgauthClientOptions,
} from "./session/types.js";
