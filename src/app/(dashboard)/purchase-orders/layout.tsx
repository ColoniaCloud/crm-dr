import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canSeeFactoryCost } from "@/lib/money-visibility";

/**
 * Órdenes de compra: solo SUPERADMIN. Todo el módulo son costos de fábrica
 * (FOB, gastos de importación, costo landed). La API ya responde 403; esto
 * evita que alguien con el link vea una pantalla rota.
 */
export default async function PurchaseOrdersLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!canSeeFactoryCost(session?.user?.role)) redirect("/products");
  return <>{children}</>;
}
