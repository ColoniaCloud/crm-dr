import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const KEY_PREFIX = "wapi_";

export function generateApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
}

export function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, 10);
}

/**
 * Verifies the `x-api-key` header against active WarrantyApiClient records.
 * Returns the matching client (and bumps lastUsedAt) or null if invalid/missing.
 */
export async function verifyWarrantyApiKey(request: Request) {
  const key = request.headers.get("x-api-key");
  if (!key) return null;

  const clients = await prisma.warrantyApiClient.findMany({ where: { active: true } });
  for (const client of clients) {
    if (await bcrypt.compare(key, client.apiKeyHash)) {
      await prisma.warrantyApiClient.update({
        where: { id: client.id },
        data: { lastUsedAt: new Date() },
      });
      return client;
    }
  }
  return null;
}
