"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// 共有PC対策: 一定時間操作がなければ自動的にログアウトする
const IDLE_MINUTES = 20;

export function AutoLogout() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.replace("/login?reason=timeout");
      }, IDLE_MINUTES * 60 * 1000);
    };
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  return null;
}
