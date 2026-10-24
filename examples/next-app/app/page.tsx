import { getServerSession, loginUrl } from "@nusgaops/sgauth/next";
import { appOrigin } from "../lib/origin";

export default async function Home() {
  const session = await getServerSession();
  const origin = await appOrigin();
  return (
    <>
      <h1>SGAuth example</h1>
      {session === null ? (
        <a href={loginUrl(`${origin}/`)}>Sign in</a>
      ) : (
        <p>
          Signed in as {session.user.preferredName ?? session.user.name}.{" "}
          <a href="/protected">Protected</a> | <a href="/finance">Finance</a>
        </p>
      )}
    </>
  );
}
