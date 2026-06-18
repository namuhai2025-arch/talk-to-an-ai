import { Capacitor } from "@capacitor/core";
import {
  Purchases,
  LOG_LEVEL,
  type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";

const REVENUECAT_IOS_KEY = "appl_zIvyCipyQSePBmlxqazcxndDwrw";
const REVENUECAT_ANDROID_KEY = "goog_PmPcqddwNAqxlqXgHvPEuSXmkHL";

let configured = false;
let configuredUserId: string | undefined;
let configuringPromise: Promise<void> | null = null;

export async function configureRevenueCat(userId?: string) {
  const platform = Capacitor.getPlatform();

  if (!userId) {
    console.log("RevenueCat skipped: no Firebase user ID yet.");
    return;
  }

  if (configured && configuredUserId === userId) {
    return;
  }

  if (configuringPromise) {
  await configuringPromise;
  if (configured && configuredUserId === userId) {
    return;
  }
}

  configuringPromise = (async () => {
    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });

    if (!configured) {
      await Purchases.configure({
        apiKey: platform === "ios" ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY,
        appUserID: userId,
      });

      configured = true;
      configuredUserId = userId;

      console.log("RevenueCat configured successfully", {
        platform,
        userId,
      });

      return;
    }

    if (configuredUserId !== userId) {
      await Purchases.logIn({ appUserID: userId });

      configuredUserId = userId;

      console.log("RevenueCat logged in user", {
        platform,
        userId,
      });
    }
  })();

  try {
  await configuringPromise;
} finally {
  configuringPromise = null;
}
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

export async function restoreTalkioPurchases() {
  if (!configured) {
    throw new Error("RevenueCat is not configured yet.");
  }

  return Purchases.restorePurchases();
}

export async function logOutRevenueCat() {
  console.log("RevenueCat logout skipped to preserve subscription identity.");
}