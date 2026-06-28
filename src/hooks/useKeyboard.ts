import { useEffect } from "react";
import { Keyboard } from "@capacitor/keyboard";

export function useKeyboard() {
  useEffect(() => {
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(console.error);
  }, []);
}