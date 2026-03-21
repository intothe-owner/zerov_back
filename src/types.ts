import { z } from "zod";

export const RegisterTokenBody = z.object({
  deviceId: z.string().min(1),
  token: z.string().min(10),
  platform: z.enum(["android", "ios", "web", "unknown"]).optional().default("android"),
  deviceModel: z.string().optional().nullable(),
  osVersion: z.string().optional().nullable(),
  appVersion: z.string().optional().nullable(),
});

export const SendToUserBody = z.object({
  userId: z.string().min(1),
  title: z.string().optional(),
  body: z.string().optional(),
  url: z.string().optional(), // WebView로 열 URL
});

export const SendToTokenBody = z.object({
  token: z.string().min(10),
  title: z.string().optional(),
  body: z.string().optional(),
  url: z.string().optional(),
});
