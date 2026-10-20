import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canSeeExpenses } from "@/lib/money-visibility";

/**
 * Control de gastos: solo SUPERADMIN. La API ya responde 403; esto evita que
 * alguien con el link vea una pantalla rota.
 */
export default async function ExpensesLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!canSeeExpenses(session?.user?.role)) redirect("/");
  return <>{children}</>;
}
