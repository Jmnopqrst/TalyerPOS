import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/Badge';
import { PaginationControls } from '../../../components/PaginationControls';
import { ToastBridge } from '../../../components/Toast';
import type { AppData, Service, UserAccount } from '../../../types/global';
import { useFilteredPagination } from '../../hooks/useFilteredPagination';
import { friendlyError, withTimeout } from '../../lib/api';
import { confirmDiscardChanges, useUnsavedChanges } from '../../lib/dirty';
import { money } from '../../lib/format';
import { valueMatchesSearch } from '../../lib/search';
import { serviceTotal } from '../shared/featureUtils';

// Feature: Services offered by the shop.
export function Services({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const emptyForm = { name: "", category: "Maintenance", durationMinutes: 30, price: 0, laborCost: 0 };
  const [form, setForm] = useState(emptyForm);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canManageServices = ["Owner", "Admin"].includes(user.role);
  const categories = ["Engine", "Electrical", "Brake", "Suspension", "Maintenance", "Diagnostics", "Repair"];
  const serviceRows = data.services.filter((service) => valueMatchesSearch(searchTerm, [service.name, service.category]));
  const servicePage = useFilteredPagination(serviceRows, [searchTerm, data.services.length]);
  const savedServiceForm = editingService ? {
    name: editingService.name,
    category: editingService.category,
    durationMinutes: editingService.duration_minutes,
    price: editingService.price,
    laborCost: editingService.labor_cost || 0
  } : emptyForm;
  const serviceFormDirty = showForm && JSON.stringify(form) !== JSON.stringify(savedServiceForm);
  useUnsavedChanges("service-form", serviceFormDirty);

  function openCreate() {
    setEditingService(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function openEdit(service: Service) {
    setEditingService(service);
    setForm({
      name: service.name,
      category: service.category,
      durationMinutes: service.duration_minutes,
      price: service.price,
      laborCost: service.labor_cost || 0
    });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  async function saveService() {
    if (!canManageServices) return;
    setError("");
    setMessage("");
    if (!form.name.trim()) {
      setError("Service name is required.");
      return;
    }
    if (form.durationMinutes <= 0) {
      setError("Duration must be greater than zero.");
      return;
    }
    if (form.price < 0) {
      setError("Service price cannot be negative.");
      return;
    }
    if (form.laborCost < 0) {
      setError("Labor cost cannot be negative.");
      return;
    }
    try {
      if (typeof window.talyer.createService !== "function" || typeof window.talyer.updateService !== "function") {
        throw new Error("Service management is not loaded yet. Please restart the app.");
      }
      if (editingService) {
        await withTimeout(window.talyer.updateService({ actorId: user.id, serviceId: editingService.id, ...form }), "updating service");
        setMessage("Service updated successfully.");
      } else {
        await withTimeout(window.talyer.createService({ actorId: user.id, ...form }), "creating service");
        setMessage("Service added successfully.");
      }
      setShowForm(false);
      setEditingService(null);
      setForm(emptyForm);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save service. Please check the fields and try again."));
    }
  }

  async function deleteService(service: Service) {
    if (!canManageServices) return;
    const confirmed = window.confirm("Are you sure you want to delete this service?");
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      if (typeof window.talyer.deleteService !== "function") {
        throw new Error("Service management is not loaded yet. Please restart the app.");
      }
      await withTimeout(window.talyer.deleteService({ actorId: user.id, serviceId: service.id }), "deleting service");
      setMessage("Service deleted successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to delete service. It may already be used in existing job orders."));
    }
  }

  return (
    <section className="panel">
      <ToastBridge success={message} error={error} />
      <div className="panel-head">
        <h2>Services</h2>
        {canManageServices && <button className="primary-button compact-button" onClick={openCreate}>Add Service</button>}
      </div>
      {error && <span className="form-error">{error}</span>}
      {servicePage.isLoading && <div className="processing-banner">Updating records...</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Service Name</th>
              <th>Category</th>
              <th>Duration</th>
              <th>Price</th>
              <th>Labor Cost</th>
              <th>Total Quote</th>
              {canManageServices && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {servicePage.pagedRows.map((service) => (
              <tr key={service.id}>
                <td>{service.name}</td>
                <td>{service.category}</td>
                <td>{service.duration_minutes} min</td>
                <td>{money.format(service.price)}</td>
                <td>{money.format(service.labor_cost || 0)}</td>
                <td>{money.format(serviceTotal(service))}</td>
                {canManageServices && (
                  <td>
                    <div className="table-actions">
                      <button className="table-action" onClick={() => openEdit(service)}><Pencil size={15} /> Edit</button>
                      <button className="table-action danger-action" onClick={() => deleteService(service)}><Trash2 size={15} /> Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {serviceRows.length === 0 && (
              <tr>
                <td colSpan={canManageServices ? 7 : 6}>
                  <span className="table-empty-copy">
                    No services yet. Add your first repair service from Services.
                    {canManageServices && <button className="secondary-button compact-button table-empty-action" onClick={openCreate}>Add service</button>}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls page={servicePage.page} pageCount={servicePage.pageCount} total={serviceRows.length} onPageChange={servicePage.setPage} />
      {showForm && (
        <div className="modal-backdrop">
          <section className="modal-window">
            <div className="panel-head">
              <h2>{editingService ? "Edit Service" : "Add Service"}</h2>
              <button className="table-action" onClick={() => {
                if (confirmDiscardChanges(serviceFormDirty)) setShowForm(false);
              }}>Close</button>
            </div>
            <div className="form-grid">
              <label className="field">
                Service Name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Oil Change" autoFocus />
              </label>
              <label className="field">
                Category
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  {categories.map((category) => <option value={category} key={category}>{category}</option>)}
                </select>
              </label>
              <label className="field">
                Duration
                <input type="number" min={1} value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Math.max(1, Number(event.target.value) || 1) })} />
              </label>
              <label className="field">
                Price
                <input type="number" min={0} value={form.price} onChange={(event) => setForm({ ...form, price: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
              <label className="field">
                Labor Cost
                <input type="number" min={0} value={form.laborCost} onChange={(event) => setForm({ ...form, laborCost: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
              <div className="credential-card">
                <span>Quotation Total</span>
                <strong>{money.format(Number(form.price) + Number(form.laborCost))}</strong>
                <small>Price plus labor cost will be used in job orders and receipts.</small>
              </div>
            </div>
            <button className="primary-button" onClick={saveService}>{editingService ? "Save Service" : "Create Service"}</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
    </section>
  );
}
