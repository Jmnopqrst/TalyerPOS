export const REQUEST_TIMEOUT_MS = 12000;

export async function withTimeout<T>(operation: Promise<T>, label = "request", timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function friendlyError(caught: unknown, fallback: string) {
  const message = caught instanceof Error ? caught.message : String(caught ?? "");
  const lower = message.toLowerCase();

  if (lower.includes("timed out")) return "This is taking longer than expected. Please try again.";
  if (lower.includes("invalid username") || lower.includes("inactive account")) return "The username or password is incorrect, or the account is disabled.";
  if (lower.includes("current password is incorrect")) return "The temporary or current password is incorrect.";
  if (lower.includes("username already exists")) return "That username is already taken. Please choose another one.";
  if (lower.includes("contact number")) return "Contact number must contain 10 to 11 digits. You may use spaces, parentheses, or dashes.";
  if (lower.includes("email address")) return "Please enter a valid email address.";
  if (lower.includes("required")) return message;
  if (lower.includes("only owner")) return "Only an Owner account can perform this action.";
  if (lower.includes("already disabled")) return "This account is already disabled.";
  if (lower.includes("already active")) return "This account is already active.";
  if (lower.includes("payment method name")) return "Payment method name is required and must be unique.";
  if (lower.includes("active payment method")) return "Please select an active payment method.";
  if (lower.includes("payment method is used")) return "This payment method is used in past transactions and cannot be deleted.";
  if (lower.includes("approval")) return "Owner or Admin approval is required. Please check the approver credentials and reason.";
  if (lower.includes("service management is not loaded")) return "Service management was updated. Please restart the app, then try again.";
  if (lower.includes("service is already used")) return "This service is already used in job orders and cannot be deleted.";
  if (lower.includes("service")) return message;
  if (lower.includes("mechanic management is not loaded")) return "Mechanics management was updated. Please restart the app, then try again.";
  if (lower.includes("mechanic is assigned")) return "This mechanic is assigned to job orders and cannot be deleted.";
  if (lower.includes("mechanic")) return message;
  if (lower.includes("supplier management is not loaded")) return "Supplier management was updated. Please restart the app, then try again.";
  if (lower.includes("supplier is linked")) return "This supplier is linked to inventory items and cannot be deleted.";
  if (lower.includes("supplier name")) return "Supplier name is required and must be unique.";
  if (lower.includes("contact person")) return "Contact person is required.";
  if (lower.includes("supplier")) return message;
  if (lower.includes("paid job orders")) return "This job order has already been paid and can no longer be edited.";
  if (lower.includes("already been paid")) return "This job order has already been paid.";
  if (lower.includes("out of stock")) return message;
  if (lower.includes("job order was not found")) return "We could not find that job order. Please refresh and try again.";
  if (lower.includes("save was canceled")) return "Receipt save was canceled. You can try again when ready.";
  if (lower.includes("printer") || lower.includes("pdf")) return "The receipt could not be printed. Please save it as PDF instead.";
  if (lower.includes("reference code")) return "Reference code is required for digital payments.";
  if (lower.includes("failed to fetch") || lower.includes("econn") || lower.includes("network")) return "The system could not complete the request. Please check the app connection and try again.";

  return fallback;
}
