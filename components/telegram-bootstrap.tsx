"use client";

import { useEffect } from "react";

import { bootstrapTelegramWebApp } from "@/lib/telegram";

export function TelegramBootstrap() {
  useEffect(() => {
    bootstrapTelegramWebApp();
  }, []);

  return null;
}
