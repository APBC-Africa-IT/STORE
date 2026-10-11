import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env["DATABASE_URL"] ??
  "postgresql://postgres:vick3900@localhost:5432/store_db";

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/schema.prisma",
  migrate: {
    adapter: () => new PrismaPg({ connectionString }),
  },
});
