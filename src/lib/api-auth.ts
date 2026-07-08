import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";

export type AppRole = "SUPERADMIN" | "ADMIN" | "OPERATOR";

/**
 * Guards an API route. Returns the session on success, or a ready-to-return
 * NextResponse (401/403) on failure. Mirrors validateBody's result shape.
 *
 *   const gate = await requireRole();                        // any authenticated user
 *   const gate = await requireRole(["ADMIN", "SUPERADMIN"]); // role-restricted
 *   if (!gate.success) return gate.response;
 *   const { session } = gate;
 */
export async function requireRole(
  roles?: AppRole[]
): Promise<
  | { success: true; session: Session }
  | { success: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      success: false,
      response: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }
  if (roles && !roles.includes(session.user.role as AppRole)) {
    return {
      success: false,
      response: NextResponse.json({ error: "Acceso restringido" }, { status: 403 }),
    };
  }
  return { success: true, session };
}
