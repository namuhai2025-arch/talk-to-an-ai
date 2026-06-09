import { Capacitor } from "@capacitor/core";
import {
  Purchases,
  LOG_LEVEL,
  type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";

const REVENUECAT_IOS_KEY = "appl_zIvyCipyQSePBmlxqazcxndDwrw";
const REVENUECAT_ANDROID_KEY = "PASTE_ANDROID_PUBLIC_SDK_KEY_HERE";

let configured = false;
let configuringPromise: Promise<void> | null = null;

export async function configureRevenueCat(userId?: string) {
  if (configured) return;

  if (configuringPromise) {
    await configuringPromise;
    return;
  }

  configuringPromise = (async () => {
    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });

    const platform = Capacitor.getPlatform();

    await Purchases.configure({
      apiKey: platform === "ios" ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY,
      appUserID: userId || undefined,
    });

    configured = true;

    console.log("RevenueCat configured successfully", {
      platform,
      userId,
    });
  })();

  await configuringPromise;
}

export function isRevenueCatConfigured() {
  return configured;
}

export async function getTalkioOfferings() {
  if (!configured) {
    console.log("RevenueCat not configured yet. Skipping offerings.");
    return null;
  }

  return Purchases.getOfferings();
}

export async function getTalkioCustomerInfo() {
  if (!configured) {
    console.log("RevenueCat not configured yet. Skipping customer info.");
    return null;
  }

  return Purchases.getCustomerInfo();
}

export async function purchaseTalkioPackage(packageToPurchase: PurchasesPackage) {
  if (!configured) {
    throw new Error("RevenueCat is not configured yet.");
  }

  return Purchases.purchasePackage({
    aPackage: packageToPurchase,
  });
}