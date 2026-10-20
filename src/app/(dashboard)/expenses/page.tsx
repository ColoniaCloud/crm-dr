"use client";

import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrency } from "@/contexts/currency-context";
import { ExpensesTab } from "@/components/expenses/expenses-tab";
import { BalanceTab } from "@/components/expenses/balance-tab";
import { RecurringTab } from "@/components/expenses/recurring-tab";
import { CategoriesTab } from "@/components/expenses/categories-tab";
import { apiJson, type ExpenseCategory, type SupplierOption } from "@/components/expenses/types";

const TAB_KEY = "expenses:tab";
const TABS = ["gastos", "balance", "recurrentes", "categorias"];

export default function ExpensesPage() {
  const { rate } = useCurrency();
  const [tab, setTab] = useState("gastos");
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(TAB_KEY);
      if (saved && TABS.includes(saved)) setTab(saved);
    } catch {}
  }, []);

  function changeTab(v: string) {
    setTab(v);
    try { sessionStorage.setItem(TAB_KEY, v); } catch {}
  }

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await apiJson<ExpenseCategory[]>("/api/expenses/categories"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las categorías");
    }
  }, []);

  useEffect(() => {
    loadCategories();
    apiJson<SupplierOption[]>("/api/suppliers")
      .then((list) => setSuppliers(list.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => setSuppliers([]));
  }, [loadCategories]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Control de gastos</h1>
        <p className="text-muted-foreground text-sm">Gastos del negocio y balance contra los ingresos · solo SUPERADMIN</p>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="w-full sm:w-auto overflow-x-auto justify-start">
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
          <TabsTrigger value="balance">Balance</TabsTrigger>
          <TabsTrigger value="recurrentes">Recurrentes</TabsTrigger>
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
        </TabsList>
        <TabsContent value="gastos" className="mt-4">
          <ExpensesTab categories={categories} suppliers={suppliers} usdRate={rate} />
        </TabsContent>
        <TabsContent value="balance" className="mt-4">
          <BalanceTab />
        </TabsContent>
        <TabsContent value="recurrentes" className="mt-4">
          <RecurringTab categories={categories} suppliers={suppliers} />
        </TabsContent>
        <TabsContent value="categorias" className="mt-4">
          <CategoriesTab categories={categories} onChanged={loadCategories} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
