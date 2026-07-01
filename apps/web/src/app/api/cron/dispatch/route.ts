import { NextResponse } from "next/server";

import { env } from "@/env";
import { automationService } from "@/server/services/automation.service";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const automations = await automationService.dispatchDueJobs();

  return NextResponse.json({ automations });
}
