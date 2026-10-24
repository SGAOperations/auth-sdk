import { SgauthConfigError } from "./session/config.js";

/** Options shared by the URL builders. */
export interface SgauthUrlOptions {
  /** SGAuth origin. Defaults to `NEXT_PUBLIC_SGAUTH_URL`, then `SGAUTH_URL`. */
  baseUrl?: string;
}

function publicBaseUrl(): string | undefined {
  try {
    // A literal member access, so Next inlines it into client bundles.
    return process.env.NEXT_PUBLIC_SGAUTH_URL;
  } catch {
    return undefined;
  }
}

function serverBaseUrl(): string | undefined {
  try {
    return process.env["SGAUTH_URL"];
  } catch {
    return undefined;
  }
}

function resolveBase(options: SgauthUrlOptions | undefined): string {
  const base = [options?.baseUrl, publicBaseUrl(), serverBaseUrl()].find(
    (candidate) => candidate !== undefined && candidate !== "",
  );
  if (base === undefined) {
    throw new SgauthConfigError(
      "@nusgaops/sgauth: set SGAUTH_URL (server) or NEXT_PUBLIC_SGAUTH_URL (browser)",
    );
  }
  return base.replace(/\/+$/, "");
}

function build(
  path: string,
  redirect: string | undefined,
  options: SgauthUrlOptions | undefined,
): string {
  const url = new URL(path, `${resolveBase(options)}/`);
  if (redirect !== undefined) url.searchParams.set("redirect", redirect);
  return url.toString();
}

/**
 * The SGAuth sign-in URL. `redirect` is where SGAuth sends the user afterwards;
 * SGAuth validates it against the product registry. Safe in the browser.
 */
export function loginUrl(
  redirect?: string,
  options?: SgauthUrlOptions,
): string {
  return build("login", redirect, options);
}

/** The SGAuth sign-out URL. Render it as a plain `<a>`, never a prefetching `<Link>`. */
export function logoutUrl(
  redirect?: string,
  options?: SgauthUrlOptions,
): string {
  return build("logout", redirect, options);
}

/** The SGAuth account page URL. */
export function accountUrl(options?: SgauthUrlOptions): string {
  return build("account", undefined, options);
}
