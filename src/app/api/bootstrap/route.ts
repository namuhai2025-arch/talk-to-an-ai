export const runtime = "nodejs";

import { corsEmpty, corsJson } from "../chat/_cors";

export async function OPTIONS(req: Request) {
  return corsEmpty(204, req);
}

export async function GET(req: Request) {
  return corsJson(
    {
      ok: true,
      user: {
        uid: "personal-workspace-user",
        plan: "companion",
        role: "admin",
        subscriptionStatus: "active",
      },
      profile: {
        nickname: "Muriel",
        timezone: "Asia/Manila",
      },
    },
    { status: 200, req },
  );
}