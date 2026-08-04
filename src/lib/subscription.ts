import { getTalkioCustomerInfo } from "@/lib/revenuecat";

export type TalkioTier =
  | "free"
  | "companion"
  | "presence"
  | "professional"
  | "elite";

function readCachedTier(): TalkioTier {
  if (typeof window === "undefined") {
    return "free";
  }

  const cachedPlan =
    localStorage.getItem("talkio_cached_plan")?.toLowerCase() ?? "";

  if (cachedPlan.includes("elite")) {
    return "elite";
  }

  if (
    cachedPlan.includes("professional") ||
    cachedPlan.includes("professionals")
  ) {
    return "professional";
  }

  if (cachedPlan.includes("presence")) {
    return "presence";
  }

  if (cachedPlan.includes("companion")) {
    return "companion";
  }

  return "free";
}

function cacheTier(tier: TalkioTier) {
  if (typeof window === "undefined") {
    return;
  }

  const labels: Record<TalkioTier, string> = {
    free: "Talkio Free",
    companion: "Talkio Companion",
    presence: "Talkio Presence",
    professional: "Talkio Professional",
    elite: "Talkio Elite",
  };

  if (tier === "free") {
    localStorage.removeItem("talkio_cached_plan");
    return;
  }

  localStorage.setItem("talkio_cached_plan", labels[tier]);
}

export async function resolveTalkioTier(): Promise<TalkioTier> {
  try {
    const customerResult = await getTalkioCustomerInfo();

    /*
     * RevenueCat may not be configured during the first moments
     * after app startup. Use the locally cached tier temporarily
     * instead of incorrectly showing a paid user as Free.
     */
    if (!customerResult?.customerInfo) {
      return readCachedTier();
    }

    const active =
      customerResult.customerInfo.entitlements?.active ?? {};

    const activeSubscriptions =
      customerResult.customerInfo.activeSubscriptions ?? [];

    const entitlementNames = Object.keys(active).map((value) =>
      value.toLowerCase(),
    );

    const subscriptionNames = activeSubscriptions.map((value) =>
      value.toLowerCase(),
    );

    const hasIdentifier = (...identifiers: string[]) => {
      return identifiers.some((identifier) => {
        const normalizedIdentifier = identifier.toLowerCase();

        return (
          entitlementNames.some((value) =>
            value.includes(normalizedIdentifier),
          ) ||
          subscriptionNames.some((value) =>
            value.includes(normalizedIdentifier),
          )
        );
      });
    };

    /*
     * Always check from the highest tier downward.
     * Higher-tier subscribers may also carry older/lower entitlements.
     */

    if (
      active["Talkio Elite"] ||
      active["elite"] ||
      hasIdentifier(
        "talkio_elite",
        "talkio elite",
        "elite_monthly",
        "elite_yearly",
      )
    ) {
      cacheTier("elite");
      return "elite";
    }

    if (
      active["Talkio Professional"] ||
      active["Talkio Professionals"] ||
      active["professional"] ||
      active["professionals"] ||
      hasIdentifier(
        "talkio_professional",
        "talkio_professionals",
        "talkio professional",
        "professional_monthly",
        "professional_yearly",
      )
    ) {
      cacheTier("professional");
      return "professional";
    }

    if (
      active["Talkio Presence"] ||
      active["presence"] ||
      hasIdentifier(
        "talkio_presence",
        "talkio presence",
        "presence_monthly",
        "presence_yearly",
      )
    ) {
      cacheTier("presence");
      return "presence";
    }

    if (
      active["Talkio Companion"] ||
      active["companion"] ||
      hasIdentifier(
        "talkio_companion",
        "talkio companion",
        "companion_monthly",
        "companion_yearly",
      )
    ) {
      cacheTier("companion");
      return "companion";
    }

    cacheTier("free");
    return "free";
  } catch (error) {
    console.warn("Failed to resolve Talkio tier:", error);

    /*
     * A temporary RevenueCat failure should not instantly relock
     * features for a known paid subscriber.
     */
    return readCachedTier();
  }
}