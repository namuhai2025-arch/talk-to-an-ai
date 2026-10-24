import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

export function useKeyboard() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(console.error);
  }, []);
}