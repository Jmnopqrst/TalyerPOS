import { useEffect, useMemo, useRef, useState } from "react";
import { Printer, ReceiptText, ShoppingCart } from "lucide-react";
import { Badge } from "../../../components/Badge";
import { ApprovalFields } from "../../../components/ApprovalFields";
import { PaginationControls } from "../../../components/PaginationControls";
import { ToastBridge } from "../../../components/Toast";
import type { AppData, CartItem, Sale, SaleItem, UserAccount } from "../../../types/global";
import { useFilteredPagination } from "../../hooks/useFilteredPagination";
import { friendlyError, withTimeout } from "../../lib/api";
import { approvalReady, approvalValidationError, emptyApproval } from "../../lib/approval";
import { formatDateTime, rowMatchesDate, todayInputValue } from "../../lib/date";
import { isEditableTarget } from "../../lib/dom";
import { money } from "../../lib/format";
import { valueMatchesSearch } from "../../lib/search";
import { buildReceiptHtml } from "../../documents/receipt";
import { closeOnEscape, printOrSaveReceiptPdf, ReceiptStatusTimeline, RecordsToolbar } from "../shared/featureUtils";
import { calculateCartTotals } from "./cartTotals";
// Feature: POS checkout, payments, receipts, and transaction history.
export function Pos({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  type CatalogItem = {
    itemType: "part";
    itemId: number;
    productCode: string;
    name: string;
    price: number;
    stock: number;
    categoryName: string;
    meta: string;
    disabled: boolean;
  };
  type HeldCart = {
    id: string;
    name: string;
    items: CartItem[];
    createdAt: string;
  };

  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("talyer-pos-held-carts") || "[]") as HeldCart[];
    } catch {
      return [];
    }
  });
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const [paymentMethod, setPaymentMethod] = useState(data.paymentMethods.find((method) => method.status === "Active")?.name ?? "");
  const [paymentReferenceCode, setPaymentReferenceCode] = useState("");
  const [cashReceived, setCashReceived] = useState(0);
  const [lastReceipt, setLastReceipt] = useState<{ receiptNo: string; html: string } | null>(null);
  const [posError, setPosError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<CatalogItem | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [showPayment, setShowPayment] = useState(false);
  const [processingState, setProcessingState] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedReceiptNo, setSelectedReceiptNo] = useState(data.sales[0]?.receipt_no ?? "");
  const [activeCategory, setActiveCategory] = useState("All Categories");
  const [transactionDateFilter, setTransactionDateFilter] = useState(todayInputValue());
  const [transactionPaymentFilter, setTransactionPaymentFilter] = useState("");
  const [voidSale, setVoidSale] = useState<Sale | null>(null);
  const [voidAction, setVoidAction] = useState<"Void" | "Refund">("Void");
  const [voidApproval, setVoidApproval] = useState(emptyApproval);
  const [receiptPreview, setReceiptPreview] = useState<{ receiptNo: string; html: string } | null>(null);
  const [showTransactions, setShowTransactions] = useState(false);
  const canManageTransactions = ["Owner", "Admin"].includes(user.role);
  const voidReasonCount = voidApproval.approvalReason.trim().length;

  const catalog = useMemo(
    () => [
      ...data.inventory.map((item) => ({
        itemType: "part" as const,
        itemId: item.id,
        productCode: item.product_code,
        name: item.name,
        price: item.sell_price,
        stock: item.stock,
        categoryName: item.category_name ?? item.category,
        meta: `${item.stock} in stock`,
        disabled: item.stock <= 0
      }))
    ],
    [data]
  );
  const categoryOptions = ["All Categories", ...data.inventoryCategories.map((category) => category.name)];
  const catalogById = useMemo(() => new Map(catalog.map((item) => [`${item.itemType}-${item.itemId}`, item])), [catalog]);
  const filteredCatalog = (activeCategory === "All Categories" ? catalog : catalog.filter((item) => item.categoryName === activeCategory))
    .filter((item) => valueMatchesSearch(searchTerm, [item.productCode, item.name, item.price, item.stock, item.price * item.stock]))
    .filter((item) => valueMatchesSearch(barcodeSearch, [item.productCode, item.name, item.categoryName]));
  const recentItems = useMemo(() => {
    const saleDateById = new Map(data.sales.map((sale) => [sale.id, sale.created_at]));
    return data.saleItems
      .slice()
      .sort((left, right) => new Date(saleDateById.get(right.sale_id) || "").getTime() - new Date(saleDateById.get(left.sale_id) || "").getTime())
      .map((item) => catalogById.get(`${item.item_type === "part" ? "part" : item.item_type}-${item.item_id}`))
      .filter((item): item is CatalogItem => Boolean(item && !item.disabled))
      .filter((item, index, items) => items.findIndex((candidate) => candidate.itemId === item.itemId) === index)
      .slice(0, 6);
  }, [catalogById, data.saleItems, data.sales]);
  const frequentItems = useMemo(() => {
    const quantityByItem = data.saleItems.reduce((map, item) => {
      if (item.item_type !== "part") return map;
      map.set(item.item_id, (map.get(item.item_id) ?? 0) + item.quantity);
      return map;
    }, new Map<number, number>());
    return Array.from(quantityByItem.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([itemId]) => catalogById.get(`part-${itemId}`))
      .filter((item): item is CatalogItem => Boolean(item && !item.disabled))
      .slice(0, 6);
  }, [catalogById, data.saleItems]);
  const activePaymentMethods = useMemo(() => data.paymentMethods.filter((method) => method.status === "Active"), [data.paymentMethods]);
  const selectedPaymentMethod = activePaymentMethods.find((method) => method.name === paymentMethod);
  const requiresReferenceCode = selectedPaymentMethod?.payment_category === "Digital";
  const { subtotal, total } = calculateCartTotals(cart);
  const changeDue = Math.max(0, cashReceived - total);
  const cashPaymentInsufficient = !requiresReferenceCode && total > 0 && cashReceived < total;
  const quickCashAmounts = Array.from(new Set([total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, 500, 1000, 2000].filter((amount) => amount > 0))).slice(0, 5);
  const isProcessing = Boolean(processingState);
  const transactionRows = useMemo(() => data.sales.filter((sale) => {
    const items = data.saleItems.filter((item) => item.sale_id === sale.id);
    return rowMatchesDate(sale.created_at, transactionDateFilter)
      && (!transactionPaymentFilter || sale.payment_method === transactionPaymentFilter)
      && valueMatchesSearch(searchTerm, [
        sale.receipt_no,
        sale.total,
        sale.subtotal,
        sale.payment_method,
        sale.status,
        ...items.flatMap((item) => [item.name, item.quantity, item.unit_price, item.line_total])
      ]);
  }), [data.sales, data.saleItems, searchTerm, transactionDateFilter, transactionPaymentFilter]);
  const transactionPage = useFilteredPagination(transactionRows, [searchTerm, transactionDateFilter, transactionPaymentFilter, data.sales.length, data.saleItems.length]);
  const selectedSale = transactionRows.find((sale) => sale.receipt_no === selectedReceiptNo) ?? transactionRows[0];
  const selectedSaleItems = selectedSale ? data.saleItems.filter((item) => item.sale_id === selectedSale.id) : [];

  useEffect(() => {
    window.localStorage.setItem("talyer-pos-held-carts", JSON.stringify(heldCarts));
  }, [heldCarts]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "F2" && cart.length > 0 && !isProcessing && activePaymentMethods.length > 0) {
        event.preventDefault();
        setShowPayment(true);
      }
      if (event.key === "F4" && cart.length > 0 && !isProcessing) {
        event.preventDefault();
        holdCurrentSale();
      }
      if (event.key === "/" && !showPayment && !selectedProduct && !voidSale && !receiptPreview) {
        event.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activePaymentMethods.length, cart.length, isProcessing, receiptPreview, selectedProduct, showPayment, voidSale]);

  useEffect(() => {
    if (!selectedProduct) return undefined;
    const handleEscape = (event: KeyboardEvent) => closeOnEscape(event, () => setSelectedProduct(null));
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedProduct]);

  useEffect(() => {
    if (!showPayment) return undefined;
    const handleEscape = (event: KeyboardEvent) => closeOnEscape(event, () => {
      if (!isProcessing) setShowPayment(false);
    });
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isProcessing, showPayment]);

  useEffect(() => {
    if (!voidSale) return undefined;
    const handleEscape = (event: KeyboardEvent) => closeOnEscape(event, () => {
      if (!isProcessing) setVoidSale(null);
    });
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isProcessing, voidSale]);

  useEffect(() => {
    if (transactionRows.length === 0) {
      setSelectedReceiptNo("");
      return;
    }
    if (!transactionRows.some((sale) => sale.receipt_no === selectedReceiptNo)) {
      setSelectedReceiptNo(transactionRows[0].receipt_no);
    }
  }, [transactionRows, selectedReceiptNo]);

  useEffect(() => {
    if (activePaymentMethods.length === 0) {
      setPaymentMethod("");
      return;
    }
    if (!activePaymentMethods.some((method) => method.name === paymentMethod)) {
      setPaymentMethod(activePaymentMethods[0].name);
    }
  }, [activePaymentMethods, paymentMethod]);

  useEffect(() => {
    if (!requiresReferenceCode) setPaymentReferenceCode("");
  }, [requiresReferenceCode]);

  useEffect(() => {
    if (requiresReferenceCode) setCashReceived(0);
  }, [requiresReferenceCode]);

  function showSuccess(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(""), 3500);
  }

  function openQuantityPrompt(item: CatalogItem) {
    if (item.disabled) return;
    setSelectedProduct(item);
    setSelectedQuantity(1);
    setPosError("");
  }

  function addCatalogItem(item: CatalogItem, quantity = 1) {
    if (item.disabled) return;
    const safeQuantity = Math.max(1, Math.min(quantity, item.stock));
    setCart((current) => {
      const existing = current.find((cartItem) => cartItem.itemType === item.itemType && cartItem.itemId === item.itemId);
      if (existing) {
        const nextQuantity = Math.min(existing.quantity + safeQuantity, item.stock);
        return current.map((cartItem) => cartItem === existing ? { ...cartItem, quantity: nextQuantity } : cartItem);
      }
      return [...current, { itemType: item.itemType, itemId: item.itemId, name: item.name, quantity: safeQuantity, unitPrice: item.price }];
    });
    setPosError("");
  }

  function addSelectedProduct() {
    if (!selectedProduct) return;
    addCatalogItem(selectedProduct, selectedQuantity);
    setSelectedProduct(null);
  }

  function submitBarcodeSearch() {
    const query = barcodeSearch.trim();
    if (!query) {
      barcodeInputRef.current?.focus();
      return;
    }
    const exactMatch = catalog.find((item) => item.productCode.toLowerCase() === query.toLowerCase());
    const match = exactMatch ?? (filteredCatalog.length === 1 ? filteredCatalog[0] : null);
    if (!match) {
      setPosError("No exact product code match. Narrow the search or select an item.");
      return;
    }
    addCatalogItem(match);
    setBarcodeSearch("");
    barcodeInputRef.current?.focus();
  }

  function updateCartQuantity(item: CartItem, quantity: number) {
    const catalogItem = catalogById.get(`${item.itemType}-${item.itemId}`);
    const maxStock = catalogItem?.stock ?? quantity;
    const safeQuantity = Math.max(1, Math.min(maxStock, quantity || 1));
    setCart((current) => current.map((cartItem) => (
      cartItem.itemId === item.itemId && cartItem.itemType === item.itemType ? { ...cartItem, quantity: safeQuantity } : cartItem
    )));
  }

  function reduceCartItem(item: CartItem) {
    setCart((current) => current.flatMap((cartItem) => {
      if (cartItem.itemId !== item.itemId || cartItem.itemType !== item.itemType) return [cartItem];
      if (cartItem.quantity <= 1) return [];
      return [{ ...cartItem, quantity: cartItem.quantity - 1 }];
    }));
  }

  function removeCartItem(item: CartItem) {
    setCart((current) => current.filter((cartItem) => cartItem.itemId !== item.itemId || cartItem.itemType !== item.itemType));
  }

  function holdCurrentSale() {
    if (cart.length === 0) return;
    const nextHold: HeldCart = {
      id: `${Date.now()}`,
      name: `Held sale ${heldCarts.length + 1}`,
      items: cart,
      createdAt: new Date().toISOString()
    };
    setHeldCarts((current) => [nextHold, ...current].slice(0, 8));
    setCart([]);
    setShowPayment(false);
    setPaymentReferenceCode("");
    setCashReceived(0);
    showSuccess(`${nextHold.name} suspended.`);
  }

  function resumeHeldSale(held: HeldCart) {
    if (cart.length > 0 && !window.confirm("Replace the current cart with this held sale?")) return;
    setCart(held.items);
    setHeldCarts((current) => current.filter((item) => item.id !== held.id));
    setShowPayment(false);
    setPaymentReferenceCode("");
    setCashReceived(0);
    showSuccess(`${held.name} resumed.`);
  }

  function deleteHeldSale(id: string) {
    setHeldCarts((current) => current.filter((item) => item.id !== id));
  }

  async function checkout() {
    if (cart.length === 0 || isProcessing || !paymentMethod) return;
    setPosError("");
    setSuccessMessage("");
    if (requiresReferenceCode && !paymentReferenceCode.trim()) {
      setPosError("Reference code is required for digital payments.");
      return;
    }
    if (cashPaymentInsufficient) {
      setPosError("Cash received cannot be lower than the total amount.");
      return;
    }
    setProcessingState("Saving transaction...");
    try {
      const referenceCode = requiresReferenceCode ? paymentReferenceCode.trim() : "";
      const receipt = await withTimeout(window.talyer.createSale({ cashierId: user.id, items: cart, discount: 0, paymentMethod, paymentReferenceCode: referenceCode }), "creating sale");
      const receiptHtml = buildReceiptHtml(data.receiptSettings, {
        receiptNo: receipt.receiptNo,
        cashierName: user.name,
        transactionType: "POS Sale",
        paymentMethod,
        paymentCategory: receipt.paymentCategory ?? selectedPaymentMethod?.payment_category,
        paymentReferenceCode: receipt.paymentReferenceCode ?? referenceCode,
        createdAt: new Date(receipt.createdAt),
        lines: cart.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice })),
        subtotal: receipt.subtotal,
        total: receipt.total
      });
      setLastReceipt({ receiptNo: receipt.receiptNo, html: receiptHtml });
      setProcessingState("Generating receipt...");
      try {
        setProcessingState("Printing / Saving PDF...");
        await printOrSaveReceiptPdf(receiptHtml, receipt.receiptNo);
      } catch (caught) {
        setPosError(friendlyError(caught, "Transaction was saved, but the receipt could not be printed or saved."));
      }
      setCart([]);
      setPaymentReferenceCode("");
      setCashReceived(0);
      setShowPayment(false);
      setSelectedReceiptNo(receipt.receiptNo);
      await onRefresh();
      showSuccess("Transaction completed successfully.");
    } catch (caught) {
      setPosError(friendlyError(caught, "Unable to complete the sale. Please try again."));
    } finally {
      setProcessingState("");
    }
  }

  function buildSaleReceipt(sale: Sale, items: SaleItem[]) {
    return buildReceiptHtml(data.receiptSettings, {
      receiptNo: sale.receipt_no,
      cashierName: sale.cashier_name,
      customerName: sale.customer_name,
      transactionType: "POS Sale",
      paymentMethod: sale.payment_method,
      paymentCategory: sale.payment_category,
      paymentReferenceCode: sale.payment_reference_code,
      createdAt: new Date(sale.created_at),
      lines: items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unit_price })),
      subtotal: sale.subtotal,
      total: sale.total
    });
  }

  async function reprintSale(sale: Sale, items: SaleItem[]) {
    setPosError("");
    setSuccessMessage("");
    setProcessingState("Generating receipt...");
    try {
      setProcessingState("Printing / Saving PDF...");
      await printOrSaveReceiptPdf(buildSaleReceipt(sale, items), sale.receipt_no);
      showSuccess("Receipt generated successfully.");
    } catch (caught) {
      setPosError(friendlyError(caught, "Unable to print or save the receipt right now."));
    } finally {
      setProcessingState("");
    }
  }

  function previewSaleReceipt(sale: Sale, items: SaleItem[]) {
    setReceiptPreview({ receiptNo: sale.receipt_no, html: buildSaleReceipt(sale, items) });
  }

  async function printPreviewReceipt() {
    if (!receiptPreview) return;
    setPosError("");
    setSuccessMessage("");
    setProcessingState("Generating receipt...");
    try {
      setProcessingState("Printing / Saving PDF...");
      await printOrSaveReceiptPdf(receiptPreview.html, receiptPreview.receiptNo);
      setReceiptPreview(null);
      showSuccess("Receipt generated successfully.");
    } catch (caught) {
      setPosError(friendlyError(caught, "Unable to print or save the receipt right now."));
    } finally {
      setProcessingState("");
    }
  }

  async function saveVoidOrRefund() {
    if (!voidSale) return;
    setPosError("");
    setSuccessMessage("");
    const approvalError = approvalValidationError(voidApproval);
    if (approvalError) {
      setPosError(approvalError);
      return;
    }
    setProcessingState(`${voidAction === "Refund" ? "Refunding" : "Voiding"} transaction...`);
    try {
      await withTimeout(window.talyer.voidOrRefundSale({
        actorId: user.id,
        saleId: voidSale.id,
        actionType: voidAction,
        ...voidApproval
      }), `${voidAction.toLowerCase()} transaction`);
      setVoidSale(null);
      setVoidApproval(emptyApproval);
      await onRefresh();
      showSuccess(`Transaction ${voidAction === "Refund" ? "refunded" : "voided"} successfully.`);
    } catch (caught) {
      setPosError(friendlyError(caught, `Unable to ${voidAction.toLowerCase()} transaction. Approval may be invalid.`));
    } finally {
      setProcessingState("");
    }
  }

  return (
    <div className="pos-layout pos-shop-layout">
      <ToastBridge success={successMessage} error={posError} />
      <section className="pos-products">
        <section className="panel pos-speed-panel">
          <div className="pos-scan-row">
            <label className="field pos-scan-field">
              Product Code / Barcode
              <input
                ref={barcodeInputRef}
                value={barcodeSearch}
                disabled={isProcessing}
                onChange={(event) => setBarcodeSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitBarcodeSearch();
                }}
                placeholder="Scan or type product code, then press Enter"
              />
            </label>
            <button className="primary-button compact-button" disabled={isProcessing} onClick={submitBarcodeSearch}>Add</button>
            <button className="secondary-button compact-button" disabled={isProcessing || cart.length === 0} onClick={holdCurrentSale}>Hold Sale (F4)</button>
          </div>
          {(frequentItems.length > 0 || recentItems.length > 0 || heldCarts.length > 0) && (
            <div className="pos-shortcut-grid">
              {frequentItems.length > 0 && (
                <div>
                  <strong>Frequent Items</strong>
                  <div className="pos-shortcut-list">
                    {frequentItems.map((item) => (
                      <button className="table-action" disabled={isProcessing} key={`frequent-${item.itemId}`} onClick={() => addCatalogItem(item)}>
                        {item.productCode} · {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {recentItems.length > 0 && (
                <div>
                  <strong>Recent Items</strong>
                  <div className="pos-shortcut-list">
                    {recentItems.map((item) => (
                      <button className="table-action" disabled={isProcessing} key={`recent-${item.itemId}`} onClick={() => addCatalogItem(item)}>
                        {item.productCode} · {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {heldCarts.length > 0 && (
                <div>
                  <strong>Held Sales</strong>
                  <div className="pos-shortcut-list">
                    {heldCarts.map((held) => (
                      <span className="held-sale-row" key={held.id}>
                        <button className="table-action" disabled={isProcessing} onClick={() => resumeHeldSale(held)}>
                          {held.name} · {held.items.length} item(s)
                        </button>
                        <button className="table-action danger-action" disabled={isProcessing} onClick={() => deleteHeldSale(held.id)}>Drop</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        <div className="category-pills">
          {categoryOptions.map((category) => (
            <button className={activeCategory === category ? "category-pill active" : "category-pill"} disabled={isProcessing} key={category} onClick={() => setActiveCategory(category)}>
              {category}
            </button>
          ))}
        </div>
        <div className="catalog-grid">
          {filteredCatalog.map((item) => (
            <button className="catalog-item" disabled={item.disabled || isProcessing} key={`${item.itemType}-${item.itemId}`} onClick={() => openQuantityPrompt(item)}>
              <strong>{item.name}</strong>
              <span>Code: <b>{item.productCode}</b></span>
              <span>Price: <b>{money.format(item.price)}</b></span>
              <span>Stocks: <b>{item.stock}</b></span>
              <em>Add to cart</em>
            </button>
          ))}
          {filteredCatalog.length === 0 && (
            <div className="empty-state action-empty-state">
              <span>No parts found in this category.</span>
              <button className="secondary-button compact-button" onClick={() => document.querySelector<HTMLInputElement>(".search-box input")?.focus()}>Search parts</button>
            </div>
          )}
        </div>
      </section>

      <section className="panel cart-panel pos-checkout-panel">
        <div className="pos-checkout-brand">
          <h2>{data.receiptSettings.system_name || "TalyerPOS"}</h2>
          <ShoppingCart size={22} />
        </div>
        <div className="cart-lines">
          {cart.length === 0 && (
            <div className="empty-state action-empty-state">
              <span>Add motorcycle parts to begin checkout.</span>
              <button className="secondary-button compact-button" onClick={() => document.querySelector<HTMLInputElement>(".search-box input")?.focus()}>Find parts</button>
            </div>
          )}
          {cart.map((item) => (
            <div className="cart-line pos-cart-line" key={`${item.itemType}-${item.itemId}`}>
              <div className="pos-cart-item-main">
                <strong>{item.name}</strong>
                <span>{item.quantity} x {money.format(item.unitPrice)}</span>
              </div>
              <b className="pos-cart-line-total">{money.format(item.quantity * item.unitPrice)}</b>
              <div className="cart-actions">
                <button className="table-action" disabled={isProcessing} onClick={() => reduceCartItem(item)}>-</button>
                <input className="qty-input cart-qty-input" type="number" min={1} disabled={isProcessing} value={item.quantity} onChange={(event) => updateCartQuantity(item, Number(event.target.value))} />
                <button className="table-action" disabled={isProcessing} onClick={() => updateCartQuantity(item, item.quantity + 1)}>+</button>
                <button className="table-action danger-action" disabled={isProcessing} onClick={() => removeCartItem(item)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <div className="totals">
          <span>Subtotal <b>{money.format(subtotal)}</b></span>
          <strong>Total <b>{money.format(total)}</b></strong>
        </div>
        {processingState && <div className="processing-banner">{processingState}</div>}
        <ReceiptStatusTimeline current={processingState} done={successMessage.includes("Transaction completed") || successMessage.includes("Receipt generated")} />
        <button className="primary-button pos-next-button" disabled={cart.length === 0 || isProcessing || activePaymentMethods.length === 0} onClick={() => setShowPayment(true)}>
          {isProcessing ? processingState : "Proceed to Payment (F2)"}
        </button>
        <button className="secondary-button" disabled={!lastReceipt || isProcessing} onClick={async () => {
          setPosError("");
          if (!lastReceipt) return;
          setProcessingState("Generating receipt...");
          try {
            setProcessingState("Printing / Saving PDF...");
            await printOrSaveReceiptPdf(lastReceipt.html, lastReceipt.receiptNo);
            showSuccess("Receipt generated successfully.");
          } catch (caught) {
            setPosError(friendlyError(caught, "Unable to print or save the receipt right now."));
          } finally {
            setProcessingState("");
          }
        }}>
          <Printer size={16} />
          {isProcessing ? processingState : `Print last receipt ${lastReceipt?.receiptNo ?? ""}`}
        </button>
        <button className="ghost-button" disabled={isProcessing} onClick={() => setShowTransactions((current) => !current)}>
          {showTransactions ? "Hide transactions" : "View transactions"}
        </button>
        {posError && <span className="form-error">{posError}</span>}
      </section>
      {showTransactions && <section className="panel transaction-panel">
        <div className="panel-head">
          <h2>Transactions</h2>
          <Badge>{`${data.sales.length} completed`}</Badge>
        </div>
        <RecordsToolbar
          showClear={Boolean(transactionDateFilter !== todayInputValue() || transactionPaymentFilter)}
          onClear={() => {
            setTransactionDateFilter(todayInputValue());
            setTransactionPaymentFilter("");
          }}
        >
          <label className="field compact-field">
            Transaction Date
            <input type="date" value={transactionDateFilter} onChange={(event) => setTransactionDateFilter(event.target.value)} />
          </label>
          <label className="field compact-field">
            Payment Method
            <select value={transactionPaymentFilter} onChange={(event) => setTransactionPaymentFilter(event.target.value)}>
              <option value="">All payments</option>
              {data.paymentMethods.map((method) => <option value={method.name} key={method.id}>{method.name}</option>)}
            </select>
          </label>
          <label className="field compact-field">
            Status
            <select value="Completed" disabled>
              <option>Completed</option>
            </select>
          </label>
        </RecordsToolbar>
        {transactionPage.isLoading && <div className="processing-banner">Updating records...</div>}
        <div className="transaction-layout">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Transaction No.</th>
                  <th>Date & Time</th>
                  <th>Total Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {transactionPage.pagedRows.map((sale) => (
                  <tr className={selectedSale?.id === sale.id ? "selected-table-row clickable-table-row" : "clickable-table-row"} key={sale.id} onClick={() => setSelectedReceiptNo(sale.receipt_no)}>
                    <td>{sale.receipt_no}</td>
                    <td>{formatDateTime(sale.created_at)}</td>
                    <td>{money.format(sale.total)}</td>
                    <td>{sale.payment_method}</td>
                    <td><Badge tone={sale.status === "Completed" ? "good" : "danger"}>{sale.status}</Badge></td>
                  </tr>
                ))}
                {transactionRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <span className="table-empty-copy">
                        No transactions yet. Complete a sale from POS to start the transaction history.
                        <button className="secondary-button compact-button table-empty-action" onClick={() => document.querySelector<HTMLInputElement>(".search-box input")?.focus()}>Start sale</button>
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls page={transactionPage.page} pageCount={transactionPage.pageCount} total={transactionRows.length} onPageChange={transactionPage.setPage} />
          <div className="transaction-detail">
            {selectedSale ? (
              <>
                <div className="panel-head">
                  <h3>{selectedSale.receipt_no}</h3>
                  <Badge tone={selectedSale.status === "Completed" ? "good" : "danger"}>{selectedSale.status}</Badge>
                </div>
                <div className="detail-grid">
                  <span>Transaction Date & Time <b>{formatDateTime(selectedSale.created_at)}</b></span>
                  <span>Payment <b>{selectedSale.payment_method}</b></span>
                  {selectedSale.payment_category === "Digital" && selectedSale.payment_reference_code && <span>Reference Code <b>{selectedSale.payment_reference_code}</b></span>}
                  <span>Cashier <b>{selectedSale.cashier_name}</b></span>
                  <span>Total <b>{money.format(selectedSale.total)}</b></span>
                  {selectedSale.status !== "Completed" && <span>Reason <b>{selectedSale.void_reason || "No reason recorded"}</b></span>}
                </div>
                <div className="transaction-lines">
                  {selectedSaleItems.map((item) => (
                    <div className="cart-line" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.quantity} x {money.format(item.unit_price)}</span>
                      </div>
                      <b>{money.format(item.line_total)}</b>
                    </div>
                  ))}
                </div>
                <button className="secondary-button" disabled={isProcessing} onClick={() => reprintSale(selectedSale, selectedSaleItems)}>
                  <Printer size={16} />
                  Reprint Receipt
                </button>
                <button className="secondary-button" disabled={isProcessing} onClick={() => previewSaleReceipt(selectedSale, selectedSaleItems)}>
                  <ReceiptText size={16} />
                  Preview Receipt
                </button>
                {canManageTransactions && selectedSale.status === "Completed" && (
                  <button className="table-action danger-action" disabled={isProcessing} onClick={() => {
                    setVoidSale(selectedSale);
                    setVoidAction("Void");
                    setVoidApproval({ ...emptyApproval, approvalReason: `Void ${selectedSale.receipt_no}` });
                  }}>
                    Void / Refund
                  </button>
                )}
              </>
            ) : (
              <p className="empty-state">Select a transaction to view the receipt details.</p>
            )}
          </div>
        </div>
      </section>}
      {selectedProduct && (
        <div className="modal-backdrop">
          <section className="modal-window pos-modal">
            <div className="panel-head">
              <h2>Select Quantity</h2>
              <button className="table-action" disabled={isProcessing} onClick={() => setSelectedProduct(null)}>Close</button>
            </div>
            <div className="detail-grid">
              <span>Part <b>{selectedProduct.name}</b></span>
              <span>Available <b>{selectedProduct.stock}</b></span>
              <span>Price <b>{money.format(selectedProduct.price)}</b></span>
              <span>Total <b>{money.format(selectedQuantity * selectedProduct.price)}</b></span>
            </div>
            <label className="field">
              Quantity
              <input type="number" min={1} max={selectedProduct.stock} disabled={isProcessing} value={selectedQuantity} onChange={(event) => setSelectedQuantity(Math.max(1, Math.min(selectedProduct.stock, Number(event.target.value) || 1)))} onKeyDown={(event) => event.key === "Enter" && addSelectedProduct()} autoFocus />
            </label>
            <button className="primary-button" disabled={isProcessing} onClick={addSelectedProduct}>Add to Cart</button>
          </section>
        </div>
      )}
      {voidSale && (
        <div className="modal-backdrop">
          <section className="modal-window pos-modal">
            <div className="panel-head">
              <h2>Void / Refund {voidSale.receipt_no}</h2>
              <button className="table-action" onClick={() => setVoidSale(null)}>Close</button>
            </div>
            <div className="approval-summary">
              <span>Action <b>{voidAction}</b></span>
              <span>Affected Record <b>{voidSale.receipt_no}</b></span>
              <span>Total <b>{money.format(voidSale.total)}</b></span>
              <span>Status <b>{voidSale.status}</b></span>
            </div>
            <div className="form-grid">
              <label className="field">
                Action
                <select value={voidAction} onChange={(event) => setVoidAction(event.target.value as "Void" | "Refund")}>
                  <option>Void</option>
                  <option>Refund</option>
                </select>
              </label>
            </div>
            <ApprovalFields value={voidApproval} onChange={setVoidApproval} reasonHint={`${voidReasonCount}/10 minimum`} />
            <button className="primary-button danger-button" disabled={isProcessing || !approvalReady(voidApproval)} onClick={saveVoidOrRefund}>
              {isProcessing ? processingState : `Confirm ${voidAction}`}
            </button>
            {posError && <span className="form-error">{posError}</span>}
          </section>
        </div>
      )}
      {receiptPreview && (
        <div className="modal-backdrop">
          <section className="modal-window report-preview-window">
            <div className="panel-head">
              <h2>Receipt Preview</h2>
              <button className="table-action" onClick={() => setReceiptPreview(null)}>Close</button>
            </div>
            <iframe className="document-preview" title="Receipt preview" srcDoc={receiptPreview.html} />
            <button className="primary-button" disabled={isProcessing} onClick={printPreviewReceipt}>Print / Save Receipt</button>
          </section>
        </div>
      )}
      {showPayment && (
        <div className="modal-backdrop">
          <section className="modal-window pos-modal" onKeyDown={(event) => {
            if (event.key === "Enter" && !requiresReferenceCode) void checkout();
          }}>
            <div className="panel-head">
              <h2>Payment</h2>
              <button className="table-action" disabled={isProcessing} onClick={() => setShowPayment(false)}>Close</button>
            </div>
            <div className="totals">
              <span>Subtotal <b>{money.format(subtotal)}</b></span>
              <strong>Total <b>{money.format(total)}</b></strong>
              {!requiresReferenceCode && (
                <>
                  <span>Cash Received <b>{money.format(cashReceived)}</b></span>
                  <span>Change <b>{money.format(changeDue)}</b></span>
                </>
              )}
            </div>
            {!requiresReferenceCode && (
              <div className="quick-cash-grid">
                {quickCashAmounts.map((amount) => (
                  <button className="table-action" disabled={isProcessing} key={amount} onClick={() => setCashReceived(amount)}>
                    {money.format(amount)}
                  </button>
                ))}
                <button className="table-action" disabled={isProcessing} onClick={() => setCashReceived(0)}>Clear Cash</button>
              </div>
            )}
            <label className="field">
              Payment Method
              <select value={paymentMethod} disabled={isProcessing || activePaymentMethods.length === 0} onChange={(event) => setPaymentMethod(event.target.value)}>
                {activePaymentMethods.map((method) => <option value={method.name} key={method.id}>{method.name}</option>)}
              </select>
            </label>
            {!requiresReferenceCode && (
              <label className="field">
                Cash Received
                <input type="number" min={0} value={cashReceived} disabled={isProcessing} onChange={(event) => setCashReceived(Math.max(0, Number(event.target.value) || 0))} autoFocus />
              </label>
            )}
            {requiresReferenceCode && (
              <label className="field">
                Reference Code
                <input value={paymentReferenceCode} disabled={isProcessing} onChange={(event) => setPaymentReferenceCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && checkout()} placeholder="Enter Reference Code" autoFocus />
              </label>
            )}
            {activePaymentMethods.length === 0 && <span className="form-error">No active payment methods are configured.</span>}
            {cashPaymentInsufficient && <span className="form-error">Cash received must be at least {money.format(total)}.</span>}
            {processingState && <div className="processing-banner">{processingState}</div>}
            <ReceiptStatusTimeline current={processingState} done={successMessage.includes("Transaction completed")} />
            <button className="primary-button" disabled={isProcessing || !paymentMethod || cashPaymentInsufficient} onClick={checkout}>
              {isProcessing ? processingState : "Complete"}
            </button>
            {posError && <span className="form-error">{posError}</span>}
          </section>
        </div>
      )}
    </div>
  );
}

