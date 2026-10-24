import { getServerSession, logoutUrl } from "@nusgaops/sgauth/next";
import type { ReactNode } from "react";
import { appOrigin } from "../lib/origin";

export const metadata = { title: "SGAuth example" };

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();
  const origin = await appOrigin();
  return (
    <html lang="en">
      <body>
        <header>
          {session !== null && (
            <nav>
              <a href="/">Home</a> | <a href="/protected">Protected</a> |{" "}
              <a href="/finance">Finance</a> |{" "}
              {/* A plain <a>, never a prefetching <Link>: prefetch would sign the user out. */}
              <a href={logoutUrl(`${origin}/`)}>Log out</a>
            </nav>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
