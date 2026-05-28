import { Capacitor } from "@capacitor/core";
import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";

const REVENUECAT_IOS_KEY = "appl_zIvyCipyQSePBmlxqazcxndDwrw";
const REVENUECAT_ANDROID_KEY = "PASTE_ANDROID_PUBLIC_SDK_KEY_HERE";

let configured = false;

export async function configureRevenueCat(userId?: string) {
  if (configured) return;

  await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });

  const platform = Capacitor.getPlatform();

  await Purchases.configure({
    apiKey: platform === "ios" ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY,
    appUserID: userId || undefined,
  });

  console.log("RevenueCat configured successfully", {
  platform,
  userId,
});

  configured = true;
}

export async function getTalkioOfferings() {
  return Purchases.getOfferings();
}

export async function getTalkioCustomerInfo() {
  return Purchases.getCustomerInfo();
}