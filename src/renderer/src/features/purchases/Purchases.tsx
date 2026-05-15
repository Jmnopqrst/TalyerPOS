import { useMemo, useState } from "react";
import { PackageCheck, Plus } from "lucide-react";
import { Badge } from "../../../components/Badge";
import { DataTable } from "../../../components/DataTable";
import { ToastBridge } from "../../../components/Toast";
import type { AppData, InventoryItem, PurchaseOrder, PurchaseOrderItem, UserAccount } from "../../../types/global";
import { suggestedReorderQuantity } from "../../documents/report";
import { friendlyError, withTimeout } from "../../lib/api";
import { formatDateTime } from "../../lib/date";
import { money } from "../../lib/format";
import { valueMatchesSearch } from "../../lib/search";

type DraftLine = {
  itemId: number;
  quantityOrdered: number;
  unitCost: number;
};

function statusTone(status: PurchaseOrder["status"]) {
  if (status === "Received") return "good";
  if (status === "Cancelled") return "danger";
  if (status === "Partially Received") return "warn";
  return "neutral";
}

export function Purchases({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const lowStockItems = useMemo(() => data.inventory.filter((item) => item.stock <= item.reorder_level), [data.inventory]);
  const rows = data.purchaseOrders.filter((order) => valueMatchesSearch(searchTerm, [order.order_no, order.supplier_name, order.status, order.notes]));
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [receiveLines, setReceiveLines] = useState<Array<{ itemId: number; quantityReceived: number }>>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function orderItems(order: PurchaseOrder) {
    return data.purchaseOrderItems.filter((item) => item.purchase_order_id === order.id);
  }

  function addLine(item: InventoryItem, suggested = suggestedReorderQuantity(item)) {
    setLines((current) => {
      if (current.some((line) => line.itemId === item.id)) return current;
      return [...current, { itemId: item.id, quantityOrdered: Math.max(1, suggested), unitCost: Number(item.unit_cost || 0) }];
    });
    setSupplierId((current) => current || item.supplier_id || 0);
    setShowForm(true);
  }

  function addBlankLine() {
    const firstItem = data.inventory.find((item) => !lines.some((line) => line.itemId === item.id));
    if (firstItem) addLine(firstItem, 1);
  }

  function openSuggestedOrder() {
    setLines(lowStockItems.map((item) => ({ itemId: item.id, quantityOrdered: suggestedReorderQuantity(item), unitCost: Number(item.unit_cost || 0) })));
    setSupplierId(lowStockItems[0]?.supplier_id ?? 0);
    setNotes("Generated from low-stock reorder suggestions.");
    setShowForm(true);
    setError("");
    setMessage("");
  }

  async function savePurchaseOrder() {
    setError("");
    setMessage("");
    if (!lines.length) {
      setError("Add at least one item.");
      return;
    }
    if (new Set(lines.map((line) => line.itemId)).size !== lines.length) {
      setError("Each purchase order line must use a different inventory item.");
      return;
    }
    try {
      const result = await withTimeout(window.talyer.createPurchaseOrder({
        actorId: user.id,
        supplierId: supplierId || null,
        notes,
        items: lines.map((line) => ({ itemId: line.itemId, quantityOrdered: line.quantityOrdered, unitCost: line.unitCost }))
      }), "creating purchase order");
      setMessage(`Purchase order ${result.orderNo} created.`);
      setShowForm(false);
      setLines([]);
      setNotes("");
      setSupplierId(0);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to create purchase order. Please check the items and try again."));
    }
  }

  function openReceive(order: PurchaseOrder) {
    const items = orderItems(order);
    setReceiveLines(items.map((item) => ({
      itemId: item.item_id,
      quantityReceived: Math.max(0, item.quantity_ordered - item.quantity_received)
    })));
    setReceivingOrder(order);
    setError("");
    setMessage("");
  }

  async function receiveOrder(full = false) {
    if (!receivingOrder) return;
    setError("");
    setMessage("");
    try {
      await withTimeout(window.talyer.updatePurchaseOrderStatus({
        actorId: user.id,
        purchaseOrderId: receivingOrder.id,
        status: full ? "Received" : "Partially Received",
        receivedItems: receiveLines.map((line) => {
          const existing = orderItems(receivingOrder).find((item) => item.item_id === line.itemId);
          return { itemId: line.itemId, quantityReceived: (existing?.quantity_received ?? 0) + line.quantityReceived };
        })
      }), "receiving purchase order");
      setMessage(`${receivingOrder.order_no} received and stock was updated.`);
      setReceivingOrder(null);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to receive purchase order. Please check quantities and try again."));
    }
  }

  async function cancelOrder(order: PurchaseOrder) {
    if (!window.confirm(`Cancel ${order.order_no}?`)) return;
    setError("");
    setMessage("");
    try {
      await withTimeout(window.talyer.updatePurchaseOrderStatus({ actorId: user.id, purchaseOrderId: order.id, status: "Cancelled" }), "cancelling purchase order");
      setMessage(`${order.order_no} cancelled.`);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to cancel purchase order."));
    }
  }

  return (
    <div className="content-grid">
      <ToastBridge success={message} error={error} />
      <section className="panel">
        <div className="panel-head">
          <h2>Purchase Orders</h2>
          <div className="table-actions">
            <button className="secondary-button compact-button" onClick={openSuggestedOrder} disabled={lowStockItems.length === 0}>
              <PackageCheck size={16} />
              Reorder Low Stock
            </button>
            <button className="primary-button compact-button" onClick={() => setShowForm(true)}>
              <Plus size={16} />
              New Purchase Order
            </button>
          </div>
        </div>
        <div className="detail-grid">
          <span>Low-stock items <b>{lowStockItems.length}</b></span>
          <span>Open purchase orders <b>{data.purchaseOrders.filter((order) => !["Received", "Cancelled"].includes(order.status)).length}</b></span>
          <span>Suppliers <b>{data.suppliers.length}</b></span>
        </div>
      </section>

      <DataTable<InventoryItem>
        title="Reorder Suggestions"
        rows={lowStockItems}
        emptyMessage="No items are at or below reorder level right now."
        columns={[
          { key: "item", label: "Item", render: (row) => `${row.product_code} - ${row.name}` },
          { key: "supplier", label: "Supplier", render: (row) => row.supplier_name || "Unassigned" },
          { key: "stock", label: "Stock", render: (row) => <Badge tone="warn">{String(row.stock)}</Badge> },
          { key: "level", label: "Reorder Level", render: (row) => String(row.reorder_level) },
          { key: "suggested", label: "Suggested Qty", render: (row) => String(suggestedReorderQuantity(row)) },
          { key: "action", label: "Action", render: (row) => <button className="table-action" onClick={() => addLine(row)}>Add to PO</button> }
        ]}
      />

      <DataTable<PurchaseOrder>
        title="Purchase Order History"
        rows={rows}
        emptyMessage="No purchase orders yet. Create one from reorder suggestions or start a blank order."
        columns={[
          { key: "order", label: "Order No.", render: (row) => row.order_no },
          { key: "supplier", label: "Supplier", render: (row) => row.supplier_name || "Unassigned" },
          { key: "items", label: "Items", render: (row) => String(orderItems(row).length) },
          { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge> },
          { key: "created", label: "Created", render: (row) => formatDateTime(row.created_at) },
          { key: "by", label: "By", render: (row) => row.created_by_name || "Unknown" },
          { key: "actions", label: "Actions", render: (row) => (
            <div className="table-actions">
              {!["Received", "Cancelled"].includes(row.status) && <button className="table-action success-action" onClick={() => openReceive(row)}>Receive</button>}
              {!["Received", "Cancelled"].includes(row.status) && <button className="table-action danger-action" onClick={() => cancelOrder(row)}>Cancel</button>}
            </div>
          ) }
        ]}
      />

      {showForm && (
        <div className="modal-backdrop">
          <section className="modal-window inventory-window">
            <div className="panel-head">
              <h2>New Purchase Order</h2>
              <button className="table-action" onClick={() => setShowForm(false)}>Close</button>
            </div>
            <div className="form-grid">
              <label className="field">
                Supplier
                <select value={supplierId} onChange={(event) => setSupplierId(Number(event.target.value))}>
                  <option value={0}>Unassigned</option>
                  {data.suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <label className="field form-wide">
                Notes
                <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Order notes or supplier instructions" />
              </label>
            </div>
            <DataTable<DraftLine>
              title="Order Items"
              rows={lines}
              action={<button className="secondary-button compact-button" onClick={addBlankLine}>Add Item</button>}
              emptyMessage="No items yet. Add a line or start from reorder suggestions."
              columns={[
                { key: "item", label: "Item", render: (line) => (
                  <select value={line.itemId} onChange={(event) => {
                    const nextItemId = Number(event.target.value);
                    if (lines.some((row) => row !== line && row.itemId === nextItemId)) {
                      setError("That item is already on this purchase order.");
                      return;
                    }
                    const nextItem = data.inventory.find((item) => item.id === nextItemId);
                    setError("");
                    setLines((current) => current.map((row) => row === line ? { ...row, itemId: nextItemId, unitCost: Number(nextItem?.unit_cost ?? row.unitCost) } : row));
                  }}>
                    {data.inventory.map((item) => <option value={item.id} key={item.id}>{item.product_code} - {item.name}</option>)}
                  </select>
                ) },
                { key: "qty", label: "Qty", render: (line) => <input type="number" min={1} value={line.quantityOrdered} onChange={(event) => setLines((current) => current.map((row) => row === line ? { ...row, quantityOrdered: Math.max(1, Number(event.target.value) || 1) } : row))} /> },
                { key: "cost", label: "Unit Cost", render: (line) => <input type="number" min={0} value={line.unitCost} onChange={(event) => setLines((current) => current.map((row) => row === line ? { ...row, unitCost: Math.max(0, Number(event.target.value) || 0) } : row))} /> },
                { key: "total", label: "Line Total", render: (line) => money.format(line.quantityOrdered * line.unitCost) },
                { key: "remove", label: "Remove", render: (line) => <button className="table-action danger-action" onClick={() => setLines((current) => current.filter((row) => row !== line))}>Remove</button> }
              ]}
            />
            <button className="primary-button" onClick={savePurchaseOrder}>Create Purchase Order</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}

      {receivingOrder && (
        <div className="modal-backdrop">
          <section className="modal-window inventory-window">
            <div className="panel-head">
              <h2>Receive {receivingOrder.order_no}</h2>
              <button className="table-action" onClick={() => setReceivingOrder(null)}>Close</button>
            </div>
            <DataTable<PurchaseOrderItem>
              title="Receive Items"
              rows={orderItems(receivingOrder)}
              columns={[
                { key: "item", label: "Item", render: (row) => `${row.product_code} - ${row.item_name}` },
                { key: "ordered", label: "Ordered", render: (row) => String(row.quantity_ordered) },
                { key: "received", label: "Already Received", render: (row) => String(row.quantity_received) },
                { key: "now", label: "Receive Now", render: (row) => {
                  const line = receiveLines.find((item) => item.itemId === row.item_id);
                  const remaining = Math.max(0, row.quantity_ordered - row.quantity_received);
                  return <input type="number" min={0} max={remaining} value={line?.quantityReceived ?? 0} onChange={(event) => setReceiveLines((current) => current.map((item) => item.itemId === row.item_id ? { ...item, quantityReceived: Math.min(remaining, Math.max(0, Number(event.target.value) || 0)) } : item))} />;
                } }
              ]}
            />
            <div className="table-actions">
              <button className="secondary-button" onClick={() => receiveOrder(false)}>Receive Entered Quantities</button>
              <button className="primary-button" onClick={() => receiveOrder(true)}>Receive All Remaining</button>
            </div>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
    </div>
  );
}
