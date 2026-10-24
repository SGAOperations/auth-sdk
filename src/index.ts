/** The version of `@nusgaops/sgauth` in use, as published to npm. */
export const version: string = __SGAUTH_SDK_VERSION__;

export { createSgauthClient, getSession } from "./session/client.js";
export type { SgauthClient } from "./session/client.js";
export { SgauthConfigError } from "./session/config.js";
export {
  createSupabaseAccessTokenProvider,
  getAccessToken,
} from "./access-token.js";
export type { SgauthAccessTokenOptions } from "./access-token.js";
export { createAccessTokenRouteHandler } from "./route-handler.js";
export {
  hasAllPositions,
  hasAnyPosition,
  hasPosition,
  isAdmin,
} from "./guards.js";
export type { MaybeSession } from "./guards.js";
export { accountUrl, loginUrl, logoutUrl } from "./urls.js";
export type { SgauthUrlOptions } from "./urls.js";
export type {
  SgaAccessTokenErrorInfo,
  SupabaseAccessTokenProvider,
} from "./token-core.js";
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
