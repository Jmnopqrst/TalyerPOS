export const emptyApproval = { approvalUsername: "", approvalPassword: "", approvalReason: "" };

export function approvalValidationError(approval: typeof emptyApproval) {
  if (!approval.approvalUsername.trim()) return "Approver username is required.";
  if (!approval.approvalPassword.trim()) return "Approver password is required.";
  if (!approval.approvalReason.trim()) return "Approval reason is required.";
  return "";
}

export function approvalReady(approval: typeof emptyApproval, minReasonLength = 10) {
  return Boolean(
    approval.approvalUsername.trim()
    && approval.approvalPassword.trim()
    && approval.approvalReason.trim().length >= minReasonLength
  );
}
