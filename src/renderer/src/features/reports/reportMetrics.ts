import type { AppData, JobOrder, PurchaseOrder } from '../../../types/global';

function suggestedReorderQuantity(item: { reorder_level: number; stock: number }) {
  return Math.max(Number(item.reorder_level || 0) * 2 - Number(item.stock || 0), 1);
}

function customerIdentity(name: string, phone = '') {
  return `${name.trim().toLowerCase()}|${phone.trim()}`;
}

function numericDate(value?: string) {
  return value ? new Date(value).getTime() : 0;
}

function latestDate(values: string[]) {
  return values.filter(Boolean).sort((left, right) => numericDate(right) - numericDate(left))[0] ?? '';
}

function isPaidJob(job: JobOrder) {
  return Boolean(job.paid_at);
}

export function buildCustomerInsightRows(data: Pick<AppData, 'customers' | 'jobOrders' | 'sales'>) {
  const rows = new Map<string, {
    customer: string;
    contact: string;
    motorcycles: Set<string>;
    jobCount: number;
    paidJobs: number;
    openJobs: number;
    posTransactions: number;
    totalRevenue: number;
    lastVisit: string;
  }>();

  for (const customer of data.customers) {
    rows.set(customerIdentity(customer.name, customer.phone), {
      customer: customer.name,
      contact: customer.phone,
      motorcycles: new Set(),
      jobCount: 0,
      paidJobs: 0,
      openJobs: 0,
      posTransactions: 0,
      totalRevenue: 0,
      lastVisit: customer.created_at ?? ''
    });
  }

  for (const job of data.jobOrders) {
    const key = customerIdentity(job.customer_name, job.contact_number);
    const row = rows.get(key) ?? {
      customer: job.customer_name,
      contact: job.contact_number,
      motorcycles: new Set<string>(),
      jobCount: 0,
      paidJobs: 0,
      openJobs: 0,
      posTransactions: 0,
      totalRevenue: 0,
      lastVisit: ''
    };
    row.jobCount += 1;
    if (isPaidJob(job)) row.paidJobs += 1;
    else row.openJobs += 1;
    if (job.plate_no) row.motorcycles.add(job.plate_no);
    if (isPaidJob(job)) row.totalRevenue += Number(job.total_amount || 0);
    row.lastVisit = latestDate([row.lastVisit, job.paid_at ?? '', job.created_at]);
    rows.set(key, row);
  }

  for (const sale of data.sales) {
    if (!sale.customer_name || sale.status !== 'Completed') continue;
    const keyPrefix = `${sale.customer_name.trim().toLowerCase()}|`;
    const key = Array.from(rows.keys()).find((candidate) => candidate.startsWith(keyPrefix)) ?? customerIdentity(sale.customer_name);
    const row = rows.get(key) ?? {
      customer: sale.customer_name,
      contact: '',
      motorcycles: new Set<string>(),
      jobCount: 0,
      paidJobs: 0,
      openJobs: 0,
      posTransactions: 0,
      totalRevenue: 0,
      lastVisit: ''
    };
    row.posTransactions += 1;
    row.totalRevenue += Number(sale.total || 0);
    row.lastVisit = latestDate([row.lastVisit, sale.created_at]);
    rows.set(key, row);
  }

  return Array.from(rows.values())
    .map((row) => ({
      customer: row.customer,
      contact: row.contact || 'Not recorded',
      motorcycleCount: row.motorcycles.size,
      jobCount: row.jobCount,
      paidJobs: row.paidJobs,
      openJobs: row.openJobs,
      posTransactions: row.posTransactions,
      totalRevenue: row.totalRevenue,
      lastVisit: row.lastVisit
    }))
    .sort((left, right) => right.totalRevenue - left.totalRevenue || numericDate(right.lastVisit) - numericDate(left.lastVisit));
}

export function buildMotorcycleInsightRows(data: Pick<AppData, 'motorcycles' | 'jobOrders'>) {
  const rows = new Map<string, {
    plateNo: string;
    customer: string;
    motorcycle: string;
    serviceCount: number;
    totalRevenue: number;
    lastService: string;
  }>();

  for (const motorcycle of data.motorcycles) {
    rows.set(motorcycle.plate_no, {
      plateNo: motorcycle.plate_no,
      customer: motorcycle.customer_name,
      motorcycle: [motorcycle.brand, motorcycle.model].filter(Boolean).join(' ') || 'Not specified',
      serviceCount: 0,
      totalRevenue: 0,
      lastService: ''
    });
  }

  for (const job of data.jobOrders) {
    const key = job.plate_no || `${job.customer_name}-${job.motorcycle_type}`;
    const row = rows.get(key) ?? {
      plateNo: job.plate_no || 'No plate',
      customer: job.customer_name,
      motorcycle: job.motorcycle_type,
      serviceCount: 0,
      totalRevenue: 0,
      lastService: ''
    };
    row.serviceCount += 1;
    if (isPaidJob(job)) row.totalRevenue += Number(job.total_amount || 0);
    row.lastService = latestDate([row.lastService, job.paid_at ?? '', job.created_at]);
    rows.set(key, row);
  }

  return Array.from(rows.values()).sort((left, right) => right.serviceCount - left.serviceCount || numericDate(right.lastService) - numericDate(left.lastService));
}

export function buildPurchasePlanningRows(data: Pick<AppData, 'inventory' | 'purchaseOrders' | 'purchaseOrderItems'>) {
  const openOrders = new Set(data.purchaseOrders.filter((order) => !['Received', 'Cancelled'].includes(order.status)).map((order) => order.id));
  const onOrderByItem = data.purchaseOrderItems.reduce((map, item) => {
    if (!openOrders.has(item.purchase_order_id)) return map;
    const remaining = Math.max(0, Number(item.quantity_ordered || 0) - Number(item.quantity_received || 0));
    map.set(item.item_id, (map.get(item.item_id) ?? 0) + remaining);
    return map;
  }, new Map<number, number>());

  return data.inventory
    .map((item) => {
      const onOrder = onOrderByItem.get(item.id) ?? 0;
      const suggested = suggestedReorderQuantity(item);
      return {
        productCode: item.product_code,
        itemId: item.id,
        item: item.name,
        supplier: item.supplier_name || 'Unassigned',
        stock: Number(item.stock || 0),
        reorderLevel: Number(item.reorder_level || 0),
        onOrder,
        suggestedReorder: suggested,
        netNeed: Math.max(0, suggested - onOrder),
        status: item.stock <= item.reorder_level ? (onOrder > 0 ? 'Covered by PO' : 'Needs PO') : (onOrder > 0 ? 'On Order' : 'Stock OK')
      };
    })
    .filter((row) => row.stock <= row.reorderLevel || row.onOrder > 0)
    .sort((left, right) => right.netNeed - left.netNeed || left.stock - right.stock);
}

export function buildSupplierPurchaseRows(data: Pick<AppData, 'suppliers' | 'purchaseOrders' | 'purchaseOrderItems'>) {
  return data.suppliers.map((supplier) => {
    const orders = data.purchaseOrders.filter((order) => order.supplier_id === supplier.id);
    const orderIds = new Set(orders.map((order) => order.id));
    const items = data.purchaseOrderItems.filter((item) => orderIds.has(item.purchase_order_id));
    return {
      supplier: supplier.name,
      orders: orders.length,
      openOrders: orders.filter((order) => !['Received', 'Cancelled'].includes(order.status)).length,
      receivedOrders: orders.filter((order) => order.status === 'Received').length,
      unitsOrdered: items.reduce((sum, item) => sum + Number(item.quantity_ordered || 0), 0),
      unitsReceived: items.reduce((sum, item) => sum + Number(item.quantity_received || 0), 0),
      lastOrder: latestDate(orders.map((order) => order.created_at))
    };
  }).filter((row) => row.orders > 0).sort((left, right) => right.openOrders - left.openOrders || numericDate(right.lastOrder) - numericDate(left.lastOrder));
}

export function csvSection(title: string, headers: string[], rows: Array<Array<string | number | undefined | null>>) {
  const escapeCell = (value: string | number | undefined | null) => String(value ?? '').replace(/"/g, '""');
  const lines = [
    [title],
    headers,
    ...rows
  ];
  return lines.map((row) => row.map((cell) => '"' + escapeCell(cell) + '"').join(',')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
