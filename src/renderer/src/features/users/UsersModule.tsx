import { useState } from 'react';
import { UserCheck, UserMinus, UserPlus } from 'lucide-react';
import { Badge } from '../../../components/Badge';
import { DataTable } from '../../../components/DataTable';
import { PaginationControls } from '../../../components/PaginationControls';
import { ToastBridge } from '../../../components/Toast';
import type { AppData, CreateUserPayload, Role, UserAccount } from '../../../types/global';
import { useFilteredPagination } from '../../hooks/useFilteredPagination';
import { friendlyError, withTimeout } from '../../lib/api';
import { confirmDiscardChanges, useUnsavedChanges } from '../../lib/dirty';
import { valueMatchesSearch } from '../../lib/search';
import { isValidContactNumber } from '../shared/featureUtils';

function roleTone(role: Role) {
  if (role === 'SuperAdmin') return 'danger';
  if (role === 'Owner') return 'danger';
  if (role === 'Admin') return 'warn';
  return 'good';
}

// Feature: Operational user account management.
export function UsersModule({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const emptyForm: Omit<CreateUserPayload, "creatorId"> = {
    role: "Cashier",
    name: "",
    contactNumber: "",
    address: "",
    email: "",
    username: ""
  };
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string; emailSent: boolean } | null>(null);
  const [showCreateWindow, setShowCreateWindow] = useState(false);
  const userRows = data.users
    .filter((account) => !account.is_mechanic)
    .filter((account) => valueMatchesSearch(searchTerm, [
      account.name,
      account.username,
      account.role,
      account.contact_number,
      account.email,
      account.address,
      account.status,
      account.must_change_password ? "must change password" : "ready"
    ]));
  const userPage = useFilteredPagination(userRows, [searchTerm, data.users.length]);
  const userFormDirty = showCreateWindow && JSON.stringify(form) !== JSON.stringify(emptyForm);
  useUnsavedChanges("user-form", userFormDirty);

  function updateContactNumber(value: string) {
    setForm({ ...form, contactNumber: value.replace(/[^0-9()\-\s]/g, "").slice(0, 18) });
  }

  async function submit() {
    setError("");
    setMessage("");
    setCredentials(null);
    if (!form.username.trim()) {
      setError("Username is required.");
      return;
    }
    if (!form.name.trim()) {
      setError("Full name is required.");
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
    if (form.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    try {
      const result = await withTimeout(window.talyer.createUser({ ...form, creatorId: user.id }), "creating user");
      setCredentials(result.credentials);
      setMessage(result.credentials.emailSent ? "User created. Credentials are shown below and marked for email delivery." : "User created. Share the temporary password securely.");
      setForm(emptyForm);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to create user. Please check the fields and try again."));
    }
  }

  async function disableAccount(targetUser: UserAccount) {
    const confirmed = window.confirm("Are you sure you want to disable this account? The user will no longer be able to log in.");
    if (!confirmed) return;
    setError("");
    setMessage("");
    setCredentials(null);
    try {
      await withTimeout(window.talyer.disableUser({ ownerId: user.id, targetUserId: targetUser.id }), "disabling user");
      setMessage(`${targetUser.username} has been disabled.`);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to disable this user. Please try again."));
    }
  }

  async function enableAccount(targetUser: UserAccount) {
    setError("");
    setMessage("");
    setCredentials(null);
    try {
      await withTimeout(window.talyer.enableUser({ ownerId: user.id, targetUserId: targetUser.id }), "enabling user");
      setMessage(`${targetUser.username} has been re-enabled.`);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to re-enable this user. Please try again."));
    }
  }

  return (
    <div className="user-management">
      <ToastBridge success={message} error={error} />
      <section className="panel user-form-panel">
        <div className="panel-head">
          <h2>User Management</h2>
          <button className="primary-button compact-button" onClick={() => {
            setError("");
            setMessage("");
            setCredentials(null);
            setShowCreateWindow(true);
          }}>
            <UserPlus size={16} />
            New User
          </button>
        </div>
        <p className="empty-state">Create and manage user accounts. New user creation opens in a separate window.</p>
        {error && !showCreateWindow && <span className="form-error">{error}</span>}
        {showCreateWindow && (
          <div className="modal-backdrop">
            <section className="modal-window user-create-window">
              <div className="panel-head">
                <h2>Create User</h2>
                <button className="table-action" onClick={() => {
                  if (confirmDiscardChanges(userFormDirty)) {
                    setError("");
                    setMessage("");
                    setCredentials(null);
                    setShowCreateWindow(false);
                  }
                }}>Close</button>
              </div>
              <div className="form-grid">
                <label className="field">
                  Role
                  <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
                    <option>Owner</option>
                    <option>Admin</option>
                    <option>Cashier</option>
                  </select>
                </label>
                <label className="field">
                  Username
                  <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="e.g. maria.admin" autoFocus />
                </label>
                <label className="field">
                  Full Name
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Full name" />
                </label>
                <label className="field">
                  Contact Number
                  <input value={form.contactNumber} onChange={(event) => updateContactNumber(event.target.value)} inputMode="tel" maxLength={18} placeholder="0917-123-4567" />
                </label>
                <label className="field form-wide">
                  Address
                  <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Complete address" />
                </label>
                <label className="field form-wide">
                  Email Address
                  <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Optional" />
                </label>
              </div>
              <button className="primary-button" onClick={submit}>Create user and generate password</button>
              {error && <span className="form-error">{error}</span>}
              {credentials && (
                <div className="credential-card">
                  <span>Generated Credentials</span>
                  <strong>Username: {credentials.username}</strong>
                  <strong>Temporary Password: {credentials.temporaryPassword}</strong>
                  <small>The user must change this password on first login before accessing the system.</small>
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {userPage.isLoading && <div className="processing-banner">Updating records...</div>}
      <DataTable<UserAccount>
        title="User Accounts"
        rows={userPage.pagedRows}
        emptyMessage={(
          <span className="table-empty-copy">
            No user accounts found. Create a new user to grant system access.
            <button className="secondary-button compact-button table-empty-action" onClick={() => {
              setError("");
              setMessage("");
              setCredentials(null);
              setShowCreateWindow(true);
            }}>Create user</button>
          </span>
        )}
        footer={<PaginationControls page={userPage.page} pageCount={userPage.pageCount} total={userRows.length} onPageChange={userPage.setPage} />}
        columns={[
          { key: "name", label: "Name", render: (row) => row.name },
          { key: "username", label: "Username", render: (row) => row.username },
          { key: "role", label: "Role", render: (row) => <Badge tone={roleTone(row.role)}>{row.role}</Badge> },
          { key: "contact", label: "Contact", render: (row) => row.contact_number || "None" },
          { key: "email", label: "Email", render: (row) => row.email || "None" },
          { key: "security", label: "Security", render: (row) => row.must_change_password ? <Badge tone="warn">Must change</Badge> : <Badge tone="good">Ready</Badge> },
          { key: "status", label: "Status", render: (row) => <Badge tone={row.status === "Active" ? "good" : "danger"}>{row.status}</Badge> },
          {
            key: "actions",
            label: "Actions",
            render: (row) =>
              row.status === "Active" ? (
                <button className="table-action danger-action" disabled={row.id === user.id} onClick={() => disableAccount(row)}>
                  <UserMinus size={15} />
                  Disable
                </button>
              ) : (
                <button className="table-action success-action" onClick={() => enableAccount(row)}>
                  <UserCheck size={15} />
                  Enable
                </button>
              )
          }
        ]}
      />
    </div>
  );
}
