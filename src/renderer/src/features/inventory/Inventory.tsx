import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "../../../components/Badge";
import { ApprovalFields } from "../../../components/ApprovalFields";
import { DataTable } from "../../../components/DataTable";
import { PaginationControls } from "../../../components/PaginationControls";
import { ToastBridge } from "../../../components/Toast";
import type { AppData, InventoryAdjustment, InventoryCategory, InventoryItem, UserAccount } from "../../../types/global";
import { useFilteredPagination } from "../../hooks/useFilteredPagination";
import { friendlyError, withTimeout } from "../../lib/api";
import { approvalReady, approvalValidationError, emptyApproval } from "../../lib/approval";
import { formatDateTime } from "../../lib/date";
import { confirmDiscardChanges, useUnsavedChanges } from "../../lib/dirty";
import { money } from "../../lib/format";
import { valueMatchesSearch } from "../../lib/search";
import { calculateInventoryForecast } from "./inventoryForecast";

function nextProductCodePreview(category: InventoryCategory, inventory: InventoryItem[]) {
  const prefix = category.code;
  const nextNumber = inventory
    .filter((item) => item.category_id === category.id || item.product_code.startsWith(`${prefix}-`))
    .map((item) => Number(item.product_code.replace(`${prefix}-`, "")))
    .filter((value) => Number.isFinite(value))
    .reduce((max, value) => Math.max(max, value), 0) + 1;
  return `${prefix}-${String(nextNumber).padStart(3, "0")}`;
}

export function Inventory({
  data,
  user,
  searchTerm = "",
  onRefresh,
  compact = false
}: {
  data: AppData;
  user: UserAccount;
  searchTerm?: string;
  onRefresh?: () => Promise<void>;
  compact?: boolean;
}) {
  const rows = compact
    ? data.inventory.filter((item) => item.stock <= item.reorder_level)
    : data.inventory.filter((item) => valueMatchesSearch(searchTerm, [item.product_code, item.name, item.category_name, item.category]));
  const inventoryPage = useFilteredPagination(rows, [searchTerm, data.inventory.length, compact]);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({
    categoryId: data.inventoryCategories[0]?.id ?? 0,
    name: "",
    stock: 0,
    reorderLevel: 0,
    unitCost: 0,
    sellPrice: 0,
    supplierId: 0
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementMode, setMovementMode] = useState<"Stock In" | "Adjustment">("Stock In");
  const [movementForm, setMovementForm] = useState({ quantity: 1, newStock: 0, supplierId: 0, referenceNo: "", reason: "" });
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [deleteApproval, setDeleteApproval] = useState(emptyApproval);
  const canManage = user.role === "Owner" || user.role === "Admin";
  const deleteReasonCount = deleteApproval.approvalReason.trim().length;
  const selectedCategory = data.inventoryCategories.find((category) => category.id === form.categoryId);
  const generatedCode = selectedCategory ? nextProductCodePreview(selectedCategory, data.inventory) : "Select category";
  const recentAdjustments = data.inventoryAdjustments.slice(0, 10);
  const savedItemForm = editingItem ? {
    categoryId: editingItem.category_id || data.inventoryCategories[0]?.id || 0,
    name: editingItem.name,
    stock: editingItem.stock,
    reorderLevel: editingItem.reorder_level,
    unitCost: editingItem.unit_cost,
    sellPrice: editingItem.sell_price,
    supplierId: editingItem.supplier_id ?? 0
  } : { categoryId: data.inventoryCategories[0]?.id ?? 0, name: "", stock: 0, reorderLevel: 0, unitCost: 0, sellPrice: 0, supplierId: 0 };
  const inventoryFormDirty = showForm && JSON.stringify(form) !== JSON.stringify(savedItemForm);
  useUnsavedChanges("inventory-item", inventoryFormDirty);
  const forecast = useMemo(() => calculateInventoryForecast(data), [data]);

  function openCreate() {
    setEditingItem(null);
    setForm({ categoryId: data.inventoryCategories[0]?.id ?? 0, name: "", stock: 0, reorderLevel: 0, unitCost: 0, sellPrice: 0, supplierId: 0 });
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function openEdit(item: InventoryItem) {
    setEditingItem(item);
    setForm({
      categoryId: item.category_id || data.inventoryCategories[0]?.id || 0,
      name: item.name,
      stock: item.stock,
      reorderLevel: item.reorder_level,
      unitCost: item.unit_cost,
      sellPrice: item.sell_price,
      supplierId: item.supplier_id ?? 0
    });
    setError("");
    setMessage("");
    setShowForm(true);
  }

  async function saveItem() {
    setError("");
    setMessage("");
    if (!form.categoryId) {
      setError("Category is required.");
      return;
    }
    if (!form.name.trim()) {
      setError("Item name is required.");
      return;
    }
    if (form.stock < 0) {
      setError("Stock count cannot be negative.");
      return;
    }
    if (form.reorderLevel < 0) {
      setError("Reorder level cannot be negative.");
      return;
    }
    if (form.unitCost < 0) {
      setError("Unit cost cannot be negative.");
      return;
    }
    if (form.sellPrice < 0) {
      setError("Sell price cannot be negative.");
      return;
    }
    try {
      if (editingItem && editingItem.category_id !== form.categoryId) {
        const confirmed = window.confirm("Changing category will not change the existing Product Code. Continue?");
        if (!confirmed) return;
      }
      if (editingItem) {
        await withTimeout(window.talyer.updateInventoryItem({
          actorId: user.id,
          itemId: editingItem.id,
          categoryId: form.categoryId,
          name: form.name,
          stock: form.stock,
          reorderLevel: form.reorderLevel,
          unitCost: form.unitCost,
          sellPrice: form.sellPrice,
          supplierId: form.supplierId || null
        }), "updating inventory item");
        setMessage("Inventory item updated successfully.");
      } else {
        await withTimeout(window.talyer.createInventoryItem({
          actorId: user.id,
          categoryId: form.categoryId,
          name: form.name,
          stock: form.stock,
          reorderLevel: form.reorderLevel,
          unitCost: form.unitCost,
          sellPrice: form.sellPrice,
          supplierId: form.supplierId || null
        }), "creating inventory item");
        setMessage("Inventory item created successfully.");
      }
      setShowForm(false);
      await onRefresh?.();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save inventory item. Please check the fields and try again."));
    }
  }

  async function deleteItem() {
    if (!deleteTarget) return;
    setError("");
    setMessage("");
    const approvalError = approvalValidationError(deleteApproval);
    if (approvalError) {
      setError(approvalError);
      return;
    }
    try {
      await withTimeout(window.talyer.deleteInventoryItem({ actorId: user.id, itemId: deleteTarget.id, ...deleteApproval }), "deleting inventory item");
      setMessage("Inventory item deleted successfully.");
      setDeleteTarget(null);
      setDeleteApproval(emptyApproval);
      await onRefresh?.();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to delete inventory item. It may already be used in a transaction."));
    }
  }

  function openMovement(item: InventoryItem, mode: "Stock In" | "Adjustment") {
    setMovementItem(item);
    setMovementMode(mode);
    setMovementForm({ quantity: 1, newStock: item.stock, supplierId: item.supplier_id ?? 0, referenceNo: "", reason: mode === "Stock In" ? "Stock replenishment" : "" });
    setError("");
    setMessage("");
  }

  async function saveMovement() {
    if (!movementItem) return;
    setError("");
    setMessage("");
    if (movementMode === "Stock In" && movementForm.quantity <= 0) {
      setError("Stock in quantity must be greater than zero.");
      return;
    }
    if (movementMode === "Adjustment" && movementForm.newStock < 0) {
      setError("New stock count cannot be negative.");
      return;
    }
    if (!movementForm.reason.trim()) {
      setError("Reason is required for stock movements.");
      return;
    }
    try {
      const result = movementMode === "Stock In"
        ? await withTimeout(window.talyer.stockInInventoryItem({
          actorId: user.id,
          itemId: movementItem.id,
          quantity: movementForm.quantity,
          supplierId: movementForm.supplierId || null,
          referenceNo: movementForm.referenceNo,
          reason: movementForm.reason
        }), "saving stock in")
        : await withTimeout(window.talyer.adjustInventoryStock({
          actorId: user.id,
          itemId: movementItem.id,
          newStock: movementForm.newStock,
          referenceNo: movementForm.referenceNo,
          reason: movementForm.reason
        }), "saving stock adjustment");
      setMessage(`${movementMode} saved successfully. Stock ${result.previousStock} -> ${result.newStock}.`);
      setMovementItem(null);
      await onRefresh?.();
    } catch (caught) {
      setError(friendlyError(caught, `Unable to save ${movementMode.toLowerCase()}. Please check the fields and try again.`));
    }
  }

  return (
    <div className="inventory-module">
      <ToastBridge success={message} error={error} />
      {!compact && (
        <section className="panel inventory-actions-panel">
          <div className="panel-head">
            <h2>Inventory Items</h2>
            {canManage && <button className="primary-button compact-button" onClick={openCreate}>New Item</button>}
          </div>
          {error && <span className="form-error">{error}</span>}
        </section>
      )}
      {!compact && inventoryPage.isLoading && <div className="processing-banner">Updating records...</div>}
      {!compact && (
        <section className="panel">
          <div className="panel-head">
            <h2>Inventory Forecasting</h2>
            <Badge>Last 30 days</Badge>
          </div>
          <div className="detail-grid">
            <span>Stock valuation <b>{money.format(forecast.stockValue)}</b></span>
            <span>Retail value <b>{money.format(forecast.retailValue)}</b></span>
            <span>Fast-moving items <b>{forecast.fastMovingCount}</b></span>
            <span>Dead stock items <b>{forecast.deadStockCount}</b></span>
          </div>
          <DataTable
            title="Reorder Suggestions"
            rows={forecast.reorderRows.slice(0, 8)}
            emptyMessage="No inventory items available for forecasting yet."
            columns={[
              { key: "item", label: "Item", render: (row) => `${row.product_code} - ${row.name}` },
              { key: "usage", label: "30-day Usage", render: (row) => String(row.usage30) },
              { key: "daily", label: "Daily Rate", render: (row) => row.dailyUsage.toFixed(2) },
              { key: "stock", label: "Stock", render: (row) => String(row.stock) },
              { key: "remaining", label: "Days Left", render: (row) => row.daysRemaining === null ? "No usage" : `${row.daysRemaining} days` },
              { key: "suggested", label: "Suggested Reorder", render: (row) => String(row.suggestedReorder) },
              { key: "status", label: "Status", render: (row) => <Badge tone={row.forecastStatus === "Reorder Now" ? "warn" : row.forecastStatus === "Dead Stock" ? "danger" : row.forecastStatus === "Fast Moving" ? "good" : "neutral"}>{row.forecastStatus}</Badge> }
            ]}
          />
          <DataTable
            title="Supplier Purchase History"
            rows={forecast.supplierRows.slice(0, 5)}
            emptyMessage="Stock In movements with supplier details will appear here."
            columns={[
              { key: "supplier", label: "Supplier", render: (row) => row.supplier },
              { key: "purchases", label: "Purchases", render: (row) => String(row.purchases) },
              { key: "quantity", label: "Units Received", render: (row) => String(row.quantity) },
              { key: "last", label: "Last Purchase", render: (row) => formatDateTime(row.lastPurchase) }
            ]}
          />
        </section>
      )}
      <DataTable<InventoryItem>
        title={compact ? "Reorder Watch" : "Inventory / Parts"}
        rows={compact ? rows : inventoryPage.pagedRows}
        emptyMessage={compact ? "No low-stock items right now. Reorder watch will show parts at or below reorder level." : (
          <span className="table-empty-copy">
            No inventory items yet. Add your first item from Inventory.
            {canManage && <button className="secondary-button compact-button table-empty-action" onClick={openCreate}>Add item</button>}
          </span>
        )}
        footer={!compact && <PaginationControls page={inventoryPage.page} pageCount={inventoryPage.pageCount} total={rows.length} onPageChange={inventoryPage.setPage} />}
        columns={[
          { key: "product_code", label: "Product Code", render: (row) => row.product_code },
          { key: "name", label: "Item Name", render: (row) => row.name },
          { key: "category", label: "Category", render: (row) => row.category_name ?? row.category },
          { key: "stock", label: "Stock", render: (row) => <Badge tone={row.stock <= row.reorder_level ? "warn" : "good"}>{String(row.stock)}</Badge> },
          { key: "reorder", label: "Reorder Level", render: (row) => String(row.reorder_level) },
          { key: "cost", label: "Unit Cost", render: (row) => money.format(row.unit_cost) },
          { key: "price", label: "Sell Price", render: (row) => money.format(row.sell_price) },
          { key: "supplier", label: "Supplier", render: (row) => row.supplier_name ?? "Unassigned" },
          ...(!compact && canManage ? [{
            key: "actions",
            label: "Actions",
            render: (row: InventoryItem) => (
              <div className="table-actions">
                <button className="table-action" onClick={() => openEdit(row)}><Pencil size={15} /> Edit</button>
                <button className="table-action success-action" onClick={() => openMovement(row, "Stock In")}>Stock In</button>
                <button className="table-action" onClick={() => openMovement(row, "Adjustment")}>Adjust</button>
                <button className="table-action danger-action" onClick={() => {
                  setDeleteTarget(row);
                  setDeleteApproval({ ...emptyApproval, approvalReason: `Delete ${row.product_code} ${row.name}` });
                }}><Trash2 size={15} /> Delete</button>
              </div>
            )
          }] : [])
        ]}
      />
      {showForm && (
        <div className="modal-backdrop">
          <section className="modal-window inventory-window">
            <div className="panel-head">
              <h2>{editingItem ? "Update Inventory Item" : "Create Inventory Item"}</h2>
              <button className="table-action" onClick={() => {
                if (confirmDiscardChanges(inventoryFormDirty)) setShowForm(false);
              }}>Close</button>
            </div>
            <div className="form-grid">
              <label className="field">
                Product Code
                <input value={editingItem?.product_code ?? generatedCode} readOnly />
              </label>
              <label className="field">
                Category
                <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: Number(event.target.value) })}>
                  {data.inventoryCategories.map((category) => <option value={category.id} key={category.id}>{category.name} ({category.code})</option>)}
                </select>
              </label>
              <label className="field form-wide">
                Item Name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label className="field">
                Stock Count
                <input type="number" min={0} value={form.stock} onChange={(event) => setForm({ ...form, stock: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
              <label className="field">
                Reorder Level
                <input type="number" min={0} value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
              <label className="field">
                Unit Cost
                <input type="number" min={0} value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
              <label className="field">
                Sell Price
                <input type="number" min={0} value={form.sellPrice} onChange={(event) => setForm({ ...form, sellPrice: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
              <label className="field form-wide">
                Supplier
                <select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: Number(event.target.value) })}>
                  <option value={0}>Unassigned</option>
                  {data.suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
            </div>
            <button className="primary-button" onClick={saveItem}>{editingItem ? "Save Changes" : "Create Inventory Item"}</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
      {!compact && (
        <DataTable<InventoryAdjustment>
          title="Recent Stock Movements"
          rows={recentAdjustments}
          emptyMessage="No stock movements yet. Use Stock In or Adjust from Inventory to record changes."
          columns={[
            { key: "date", label: "Date & Time", render: (row) => formatDateTime(row.created_at) },
            { key: "product", label: "Product Code", render: (row) => row.product_code },
            { key: "item", label: "Item", render: (row) => row.item_name },
            { key: "type", label: "Type", render: (row) => <Badge tone={row.movement_type === "Stock In" ? "good" : "warn"}>{row.movement_type}</Badge> },
            { key: "quantity", label: "Qty / Delta", render: (row) => row.quantity > 0 ? `+${row.quantity}` : String(row.quantity) },
            { key: "stock", label: "Stock", render: (row) => `${row.previous_stock} -> ${row.new_stock}` },
            { key: "reference", label: "Reference", render: (row) => row.reference_no || "None" },
            { key: "reason", label: "Reason", render: (row) => row.reason },
            { key: "actor", label: "By", render: (row) => row.actor_name }
          ]}
        />
      )}
      {movementItem && (
        <div className="modal-backdrop">
          <section className="modal-window inventory-window">
            <div className="panel-head">
              <h2>{movementMode}: {movementItem.product_code}</h2>
              <button className="table-action" onClick={() => {
                const dirty = movementMode === "Stock In"
                  ? movementForm.quantity !== 1 || Boolean(movementForm.referenceNo.trim()) || movementForm.reason !== "Stock replenishment" || movementForm.supplierId !== (movementItem.supplier_id ?? 0)
                  : movementForm.newStock !== movementItem.stock || Boolean(movementForm.referenceNo.trim()) || Boolean(movementForm.reason.trim());
                if (confirmDiscardChanges(dirty)) setMovementItem(null);
              }}>Close</button>
            </div>
            <div className="detail-grid">
              <span>Item <b>{movementItem.name}</b></span>
              <span>Current Stock <b>{movementItem.stock}</b></span>
            </div>
            <div className="form-grid">
              {movementMode === "Stock In" ? (
                <>
                  <label className="field">
                    Quantity to Add
                    <input type="number" min={1} value={movementForm.quantity} onChange={(event) => setMovementForm({ ...movementForm, quantity: Math.max(1, Number(event.target.value) || 1) })} />
                  </label>
                  <label className="field">
                    Supplier
                    <select value={movementForm.supplierId} onChange={(event) => setMovementForm({ ...movementForm, supplierId: Number(event.target.value) })}>
                      <option value={0}>Unassigned</option>
                      {data.suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}
                    </select>
                  </label>
                </>
              ) : (
                <label className="field">
                  New Stock Count
                  <input type="number" min={0} value={movementForm.newStock} onChange={(event) => setMovementForm({ ...movementForm, newStock: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
              )}
              <label className="field">
                Reference No.
                <input value={movementForm.referenceNo} onChange={(event) => setMovementForm({ ...movementForm, referenceNo: event.target.value })} placeholder="Invoice, delivery receipt, or memo no." />
              </label>
              <label className="field form-wide">
                Reason
                <input value={movementForm.reason} onChange={(event) => setMovementForm({ ...movementForm, reason: event.target.value })} placeholder="Reason for stock movement" />
              </label>
            </div>
            <button className="primary-button" onClick={saveMovement}>Save {movementMode}</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-backdrop">
          <section className="modal-window inventory-window">
            <div className="panel-head">
              <h2>Approve Inventory Delete</h2>
              <button className="table-action" onClick={() => setDeleteTarget(null)}>Close</button>
            </div>
            <div className="approval-summary">
              <span>Action <b>Delete inventory item</b></span>
              <span>Affected Record <b>{deleteTarget.product_code}</b></span>
              <span>Item <b>{deleteTarget.name}</b></span>
              <span>Current Stock <b>{deleteTarget.stock}</b></span>
            </div>
            <ApprovalFields value={deleteApproval} onChange={setDeleteApproval} reasonHint={`${deleteReasonCount}/10 minimum`} />
            <button className="primary-button danger-button" disabled={!approvalReady(deleteApproval)} onClick={deleteItem}>Delete Inventory Item</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
    </div>
  );
}
