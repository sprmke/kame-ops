import { auth } from '@/lib/auth/auth-config';

import type { TRPCContext } from './trpc';

export async function createTRPCContext(): Promise<TRPCContext> {
  const session = await auth();
  return { session };
}
