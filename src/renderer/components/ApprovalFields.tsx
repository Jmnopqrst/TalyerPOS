import type { ApprovalPayload } from "../types/global";

export function ApprovalFields({
  value,
  onChange,
  reasonLabel = "Reason",
  reasonPlaceholder = "Reason for approval",
  reasonHint
}: {
  value: ApprovalPayload;
  onChange: (value: ApprovalPayload) => void;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonHint?: string;
}) {
  return (
    <div className="form-grid">
      <label className="field">
        Approver Username
        <input value={value.approvalUsername} onChange={(event) => onChange({ ...value, approvalUsername: event.target.value })} />
      </label>
      <label className="field">
        Approver Password
        <input type="password" value={value.approvalPassword} onChange={(event) => onChange({ ...value, approvalPassword: event.target.value })} />
      </label>
      <label className="field form-wide">
        {reasonLabel} {reasonHint && <small>{reasonHint}</small>}
        <input value={value.approvalReason} onChange={(event) => onChange({ ...value, approvalReason: event.target.value })} placeholder={reasonPlaceholder} />
      </label>
    </div>
  );
}
