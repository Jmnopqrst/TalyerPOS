import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { PaginationControls } from '../../../components/PaginationControls';
import { ToastBridge } from '../../../components/Toast';
import type { AppData, Supplier, UserAccount } from '../../../types/global';
import { useFilteredPagination } from '../../hooks/useFilteredPagination';
import { friendlyError, withTimeout } from '../../lib/api';
import { confirmDiscardChanges, useUnsavedChanges } from '../../lib/dirty';
import { valueMatchesSearch } from '../../lib/search';
import { isValidContactNumber } from '../shared/featureUtils';

// Feature: Supplier records used by inventory.
export function Suppliers({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const emptyForm = { name: "", contact: "", phone: "" };
  const [form, setForm] = useState(emptyForm);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canManageSuppliers = ["Owner", "Admin"].includes(user.role);
  const supplierRows = data.suppliers.filter((supplier) => valueMatchesSearch(searchTerm, [supplier.name, supplier.contact, supplier.phone]));
  const supplierPage = useFilteredPagination(supplierRows, [searchTerm, data.suppliers.length]);
  const savedSupplierForm = editingSupplier ? { name: editingSupplier.name, contact: editingSupplier.contact, phone: editingSupplier.phone } : emptyForm;
  const supplierFormDirty = showForm && JSON.stringify(form) !== JSON.stringify(savedSupplierForm);
  useUnsavedChanges("supplier-form", supplierFormDirty);

  function updateContactNumber(value: string) {
    setForm({ ...form, phone: value.replace(/[^0-9()\-\s]/g, "").slice(0, 18) });
  }

  function openCreate() {
    setEditingSupplier(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function openEdit(supplier: Supplier) {
    setEditingSupplier(supplier);
    setForm({ name: supplier.name, contact: supplier.contact, phone: supplier.phone });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  async function saveSupplier() {
    if (!canManageSuppliers) return;
    setError("");
    setMessage("");
    if (!form.name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    if (!form.contact.trim()) {
      setError("Contact person is required.");
      return;
    }
    if (!isValidContactNumber(form.phone)) {
      setError("Contact number must contain 10 to 11 digits.");
      return;
    }
    try {
      if (typeof window.talyer.createSupplier !== "function" || typeof window.talyer.updateSupplier !== "function") {
        throw new Error("Supplier management is not loaded yet. Please restart the app.");
      }
      if (editingSupplier) {
        await withTimeout(window.talyer.updateSupplier({ actorId: user.id, supplierId: editingSupplier.id, ...form }), "updating supplier");
        setMessage("Supplier updated successfully.");
      } else {
        await withTimeout(window.talyer.createSupplier({ actorId: user.id, ...form }), "creating supplier");
        setMessage("Supplier added successfully.");
      }
      setShowForm(false);
      setEditingSupplier(null);
      setForm(emptyForm);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save supplier. Please check the fields and try again."));
    }
  }

  async function deleteSupplier(supplier: Supplier) {
    if (!canManageSuppliers) return;
    const confirmed = window.confirm("Are you sure you want to delete this supplier?");
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      await withTimeout(window.talyer.deleteSupplier({ actorId: user.id, supplierId: supplier.id }), "deleting supplier");
      setMessage("Supplier deleted successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to delete supplier. It may already be linked to inventory items."));
    }
  }

  return (
    <section className="panel">
      <ToastBridge success={message} error={error} />
      <div className="panel-head">
        <h2>Suppliers</h2>
        {canManageSuppliers && <button className="primary-button compact-button" onClick={openCreate}>Add Supplier</button>}
      </div>
      {error && <span className="form-error">{error}</span>}
      {supplierPage.isLoading && <div className="processing-banner">Updating records...</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Supplier Name</th>
              <th>Contact Person</th>
              <th>Contact Number</th>
              {canManageSuppliers && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {supplierPage.pagedRows.map((supplier) => (
              <tr key={supplier.id}>
                <td>{supplier.name}</td>
                <td>{supplier.contact}</td>
                <td>{supplier.phone}</td>
                {canManageSuppliers && (
                  <td>
                    <div className="table-actions">
                      <button className="table-action" onClick={() => openEdit(supplier)}><Pencil size={15} /> Edit</button>
                      <button className="table-action danger-action" onClick={() => deleteSupplier(supplier)}><Trash2 size={15} /> Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {supplierRows.length === 0 && (
              <tr>
                <td colSpan={canManageSuppliers ? 4 : 3}>
                  <span className="table-empty-copy">
                    No suppliers yet. Add your first supplier from Suppliers.
                    {canManageSuppliers && <button className="secondary-button compact-button table-empty-action" onClick={openCreate}>Add supplier</button>}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls page={supplierPage.page} pageCount={supplierPage.pageCount} total={supplierRows.length} onPageChange={supplierPage.setPage} />
      {showForm && (
        <div className="modal-backdrop">
          <section className="modal-window">
            <div className="panel-head">
              <h2>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</h2>
              <button className="table-action" onClick={() => {
                if (confirmDiscardChanges(supplierFormDirty)) setShowForm(false);
              }}>Close</button>
            </div>
            <div className="form-grid">
              <label className="field">
                Supplier Name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Supplier name" autoFocus />
              </label>
              <label className="field">
                Contact Person
                <input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} placeholder="Contact person" />
              </label>
              <label className="field">
                Contact Number
                <input value={form.phone} onChange={(event) => updateContactNumber(event.target.value)} inputMode="tel" maxLength={18} placeholder="0917-123-4567" />
              </label>
            </div>
            <button className="primary-button" onClick={saveSupplier}>{editingSupplier ? "Save Supplier" : "Create Supplier"}</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
    </section>
  );
}
