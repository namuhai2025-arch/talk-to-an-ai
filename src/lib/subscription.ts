import { getTalkioCustomerInfo } from "@/lib/revenuecat";

export type TalkioTier = "free" | "companion" | "presence";

export async function resolveTalkioTier(): Promise<TalkioTier> {
  try {
    const customerResult = await getTalkioCustomerInfo();

    const active = customerResult?.customerInfo?.entitlements?.active || {};
    const activeSubscriptions =
      customerResult?.customerInfo?.activeSubscriptions || [];

    if (
      active["Talkio Presence"] ||
      active["presence"] ||
      activeSubscriptions.includes("talkio_presence_monthly_v2")
    ) {
      localStorage.setItem("talkio_cached_plan", "Talkio Presence");
      return "presence";
    }

    if (
      active["Talkio Companion"] ||
      active["companion"] ||
      activeSubscriptions.includes("talkio_companion_monthly")
    ) {
      localStorage.setItem("talkio_cached_plan", "Talkio Companion");
      return "companion";
    }

    localStorage.removeItem("talkio_cached_plan");
    return "free";
  } catch (error) {
  console.warn("Failed to resolve Talkio tier:", error);
  localStorage.removeItem("talkio_cached_plan");
  return "free";
}
}