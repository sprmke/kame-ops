import { mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { creditCardService } from "./credit-card.service";
import { gmailService } from "./gmail.service";
import { applyIntegrationsToEnv } from "./integration-env.service";

/** Per-user SOA workdir + env for Gmail fetch and PDF parse. */
export async function prepareSoaWorkdir(userId: string): Promise<string> {
  const cards = await creditCardService.listForSoaPipeline(userId);
  const workDir = join(tmpdir(), `kame-ops-${userId}`);

  process.env.DATA_DIR = workDir;
  process.env.CARDS_JSON = JSON.stringify(cards);

  await applyIntegrationsToEnv(userId);
  await gmailService.applyTokensToEnv(userId);
  await mkdir(workDir, { recursive: true });
  await mkdir(join(workDir, "downloads"), { recursive: true });
  await mkdir(join(workDir, "output"), { recursive: true });

  return workDir;
}
