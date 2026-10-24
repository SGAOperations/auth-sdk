import { createSgaProxy } from "@nusgaops/sgauth/proxy";

// Only the home page is public. Every other route needs the SGAuth cookie.
export const proxy = createSgaProxy({ publicPaths: ["/"] });

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
