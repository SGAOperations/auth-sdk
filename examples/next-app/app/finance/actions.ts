"use server";

import { hasPosition, requireSession } from "@nusgaops/sgauth/next";
import { redirect } from "next/navigation";

export async function approvePurchase(): Promise<void> {
  // The check runs on the server, so hiding the button would not be enough.
  const session = await requireSession();
  redirect(
    hasPosition(session, "vp-finance")
      ? "/finance?result=approved"
      : "/finance?result=denied",
  );
}
