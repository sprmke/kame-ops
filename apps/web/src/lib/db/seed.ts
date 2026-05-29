import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "./index";
import { users } from "./schema";

async function seed() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@localhost").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "admin123";

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    console.log(`User ${email} already exists (${existing.id})`);
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ email, name: "Admin", password: hash })
    .returning();

  console.log(`Created admin user ${email} (${user?.id})`);
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
