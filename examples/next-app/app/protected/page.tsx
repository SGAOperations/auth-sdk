import { requireSession } from "@nusgaops/sgauth/next";

export default async function Protected() {
  // The proxy only checked that a cookie exists. This validates it.
  const { user, positions } = await requireSession();
  return (
    <>
      <h1>Hello, {user.preferredName ?? user.name}</h1>
      <p>{user.email}</p>
      {positions.length === 0 ? (
        <p>You hold no positions.</p>
      ) : (
        <ul>
          {positions.map((position) => (
            <li key={position.key}>{position.name}</li>
          ))}
        </ul>
      )}
    </>
  );
}
