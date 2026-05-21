import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/Badge';
import { PaginationControls } from '../../../components/PaginationControls';
import { ToastBridge } from '../../../components/Toast';
import type { AppData, UserAccount } from '../../../types/global';
import { useFilteredPagination } from '../../hooks/useFilteredPagination';
import { friendlyError, withTimeout } from '../../lib/api';
import { confirmDiscardChanges, useUnsavedChanges } from '../../lib/dirty';
import { valueMatchesSearch } from '../../lib/search';
import { isValidContactNumber } from '../shared/featureUtils';

// Feature: Mechanics/staff profile management.
export function Staff({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const emptyForm = { name: "", contactNumber: "", address: "", status: "Active" as "Active" | "Disabled" };
  const [form, setForm] = useState(emptyForm);
  const [editingMechanic, setEditingMechanic] = useState<UserAccount | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const mechanics = data.users
    .filter((account) => account.is_mechanic && !["Owner", "Admin"].includes(account.role))
    .filter((mechanic) => valueMatchesSearch(searchTerm, [mechanic.name, mechanic.address, mechanic.contact_number]));
  const mechanicPage = useFilteredPagination(mechanics, [searchTerm, data.users.length]);
  const canManageMechanics = ["Owner", "Admin"].includes(user.role);
  const savedMechanicForm = editingMechanic ? {
    name: editingMechanic.name,
    contactNumber: editingMechanic.contact_number || "",
    address: editingMechanic.address || "",
    status: editingMechanic.status === "Active" ? "Active" : "Disabled"
  } : emptyForm;
  const mechanicFormDirty = showForm && JSON.stringify(form) !== JSON.stringify(savedMechanicForm);
  useUnsavedChanges("mechanic-form", mechanicFormDirty);

  function updateContactNumber(value: string) {
    setForm({ ...form, contactNumber: value.replace(/[^0-9()\-\s]/g, "").slice(0, 18) });
  }

  function openCreate() {
    setEditingMechanic(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function openEdit(mechanic: UserAccount) {
    setEditingMechanic(mechanic);
    setForm({
      name: mechanic.name,
      contactNumber: mechanic.contact_number || "",
      address: mechanic.address || "",
      status: mechanic.status === "Active" ? "Active" : "Disabled"
    });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  async function saveMechanic() {
    if (!canManageMechanics) return;
    setError("");
    setMessage("");
    if (!form.name.trim()) {
      setError("Mechanic name is required.");
      return;
    }
    if (!isValidContactNumber(form.contactNumber)) {
      setError("Contact number must contain 10 to 11 digits.");
      return;
    }
    if (!form.address.trim()) {
      setError("Address is required.");
      return;
    }
    try {
      if (typeof window.talyer.createMechanic !== "function" || typeof window.talyer.updateMechanic !== "function") {
        throw new Error("Mechanic management is not loaded yet. Please restart the app.");
      }
      if (editingMechanic) {
        await withTimeout(window.talyer.updateMechanic({ actorId: user.id, mechanicId: editingMechanic.id, ...form }), "updating mechanic");
        setMessage("Mechanic updated successfully.");
      } else {
        await withTimeout(window.talyer.createMechanic({ actorId: user.id, ...form }), "creating mechanic");
        setMessage("Mechanic added successfully.");
      }
      setShowForm(false);
      setEditingMechanic(null);
      setForm(emptyForm);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save mechanic. Please check the fields and try again."));
    }
  }

  async function deleteMechanic(mechanic: UserAccount) {
    if (!canManageMechanics) return;
    const confirmed = window.confirm("Are you sure you want to delete this mechanic?");
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      await withTimeout(window.talyer.deleteMechanic({ actorId: user.id, mechanicId: mechanic.id }), "deleting mechanic");
      setMessage("Mechanic deleted successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to delete mechanic. It may already be assigned to job orders."));
    }
  }

  return (
    <section className="panel">
      <ToastBridge success={message} error={error} />
      <div className="panel-head">
        <h2>Mechanics</h2>
        {canManageMechanics && <button className="primary-button compact-button" onClick={openCreate}>Add Mechanic</button>}
      </div>
      {error && <span className="form-error">{error}</span>}
      {mechanicPage.isLoading && <div className="processing-banner">Updating records...</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact Number</th>
              <th>Address</th>
              <th>Status</th>
              {canManageMechanics && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {mechanicPage.pagedRows.map((mechanic) => (
              <tr key={mechanic.id}>
                <td>{mechanic.name}</td>
                <td>{mechanic.contact_number || "None"}</td>
                <td>{mechanic.address || "None"}</td>
                <td><Badge tone={mechanic.status === "Active" ? "good" : "danger"}>{mechanic.status === "Active" ? "Active" : "Inactive"}</Badge></td>
                {canManageMechanics && (
                  <td>
                    <div className="table-actions">
                      <button className="table-action" onClick={() => openEdit(mechanic)}><Pencil size={15} /> Edit</button>
                      <button className="table-action danger-action" onClick={() => deleteMechanic(mechanic)}><Trash2 size={15} /> Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {mechanics.length === 0 && (
              <tr>
                <td colSpan={canManageMechanics ? 5 : 4}>
                  <span className="table-empty-copy">
                    No mechanics yet. Add your first mechanic from Mechanics.
                    {canManageMechanics && <button className="secondary-button compact-button table-empty-action" onClick={openCreate}>Add mechanic</button>}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls page={mechanicPage.page} pageCount={mechanicPage.pageCount} total={mechanics.length} onPageChange={mechanicPage.setPage} />
      {showForm && (
        <div className="modal-backdrop">
          <section className="modal-window">
            <div className="panel-head">
              <h2>{editingMechanic ? "Edit Mechanic" : "Add Mechanic"}</h2>
              <button className="table-action" onClick={() => {
                if (confirmDiscardChanges(mechanicFormDirty)) setShowForm(false);
              }}>Close</button>
            </div>
            <div className="form-grid">
              <label className="field">
                Name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Mechanic name" autoFocus />
              </label>
              <label className="field">
                Contact Number
                <input value={form.contactNumber} onChange={(event) => updateContactNumber(event.target.value)} inputMode="tel" maxLength={18} placeholder="0917-123-4567" />
              </label>
              <label className="field form-wide">
                Address
                <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Complete address" />
              </label>
              <label className="field">
                Status
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "Active" | "Disabled" })}>
                  <option value="Active">Active</option>
                  <option value="Disabled">Inactive</option>
                </select>
              </label>
            </div>
            <button className="primary-button" onClick={saveMechanic}>{editingMechanic ? "Save Mechanic" : "Create Mechanic"}</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
    </section>
  );
}
