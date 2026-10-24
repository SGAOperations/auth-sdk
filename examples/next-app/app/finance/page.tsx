import { requireSession } from "@nusgaops/sgauth/next";
import { approvePurchase } from "./actions";

export default async function Finance({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  await requireSession();
  const { result } = await searchParams;
  return (
    <>
      <h1>Finance</h1>
      <form action={approvePurchase}>
        <button type="submit">Approve purchase</button>
      </form>
      {result === "approved" && <p>Purchase approved.</p>}
      {result === "denied" && (
        <p>
          You need the Vice President of Finance position to approve purchases.
        </p>
      )}
    </>
  );
}
