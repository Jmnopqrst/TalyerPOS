import type { AppData, JobProduct } from "../../../types/global";

export type InventoryForecastStatus = "Reorder Now" | "Dead Stock" | "Fast Moving" | "Stable";

function parseProducts(raw: string | undefined): JobProduct[] {
  try {
    return JSON.parse(raw || "[]") as JobProduct[];
  } catch {
    return [];
  }
}

function completedJobStatus(status: string) {
  return status === "Ready" || status === "Released" ? "Completed" : status;
}

export function calculateInventoryForecast(data: Pick<AppData, "inventory" | "inventoryAdjustments" | "jobOrders" | "saleItems" | "sales">, windowDays = 30, now = new Date()) {
  const since = new Date(now);
  since.setDate(since.getDate() - windowDays);
  const saleById = new Map(data.sales.map((sale) => [sale.id, sale]));
  const usageByItem = new Map<number, number>();

  for (const line of data.saleItems) {
    const sale = saleById.get(line.sale_id);
    if (line.item_type !== "part" || !sale || sale.status !== "Completed" || new Date(sale.created_at) < since) continue;
    usageByItem.set(line.item_id, (usageByItem.get(line.item_id) ?? 0) + Number(line.quantity || 0));
  }

  for (const job of data.jobOrders) {
    if (new Date(job.created_at) < since || completedJobStatus(job.status) !== "Completed") continue;
    for (const product of parseProducts(job.products_json)) {
      usageByItem.set(product.itemId, (usageByItem.get(product.itemId) ?? 0) + Number(product.quantity || 0));
    }
  }

  const reorderRows = data.inventory
    .map((item) => {
      const usage30 = usageByItem.get(item.id) ?? 0;
      const dailyUsage = usage30 / windowDays;
      const daysRemaining = dailyUsage > 0 ? Math.floor(item.stock / dailyUsage) : null;
      const targetStock = Math.max(item.reorder_level * 2, Math.ceil(dailyUsage * 14));
      const suggestedReorder = Math.max(0, targetStock - item.stock);
      const stockValue = item.stock * Number(item.unit_cost || 0);
      const retailValue = item.stock * Number(item.sell_price || 0);
      const forecastStatus: InventoryForecastStatus = item.stock <= item.reorder_level || (daysRemaining !== null && daysRemaining <= 7)
        ? "Reorder Now"
        : usage30 === 0 && item.stock > 0
          ? "Dead Stock"
          : usage30 >= 5 || dailyUsage >= 0.2
            ? "Fast Moving"
            : "Stable";
      return { ...item, usage30, dailyUsage, daysRemaining, suggestedReorder, stockValue, retailValue, forecastStatus };
    })
    .sort((left, right) => {
      const priority = (status: InventoryForecastStatus) => status === "Reorder Now" ? 0 : status === "Fast Moving" ? 1 : status === "Dead Stock" ? 2 : 3;
      return priority(left.forecastStatus) - priority(right.forecastStatus) || right.usage30 - left.usage30;
    });

  const supplierRows = Array.from(data.inventoryAdjustments
    .filter((movement) => movement.movement_type === "Stock In")
    .reduce((map, movement) => {
      const key = movement.supplier_id ? String(movement.supplier_id) : `unassigned-${movement.item_id}`;
      const current = map.get(key) ?? {
        supplier: movement.supplier_name || "Unassigned",
        purchases: 0,
        quantity: 0,
        lastPurchase: movement.created_at
      };
      current.purchases += 1;
      current.quantity += Number(movement.quantity || 0);
      if (new Date(movement.created_at) > new Date(current.lastPurchase)) current.lastPurchase = movement.created_at;
      map.set(key, current);
      return map;
    }, new Map<string, { supplier: string; purchases: number; quantity: number; lastPurchase: string }>())
    .values())
    .sort((left, right) => right.quantity - left.quantity);

  return {
    reorderRows,
    supplierRows,
    stockValue: reorderRows.reduce((sum, item) => sum + item.stockValue, 0),
    retailValue: reorderRows.reduce((sum, item) => sum + item.retailValue, 0),
    fastMovingCount: reorderRows.filter((item) => item.forecastStatus === "Fast Moving").length,
    deadStockCount: reorderRows.filter((item) => item.forecastStatus === "Dead Stock").length
  };
}
