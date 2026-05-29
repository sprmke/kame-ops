import { isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { soaService } from "@/server/services/soa.service";

export async function GET(request: Request) {
  const secret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allUsers = await db.query.users.findMany({
    where: isNull(users.deletedAt),
    columns: { id: true },
  });

  const results = [];
  for (const user of allUsers) {
    try {
      const r = await soaService.pollNewSoaFromGmail(user.id);
      results.push({ userId: user.id, ...r });
    } catch (error) {
      results.push({
        userId: user.id,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
