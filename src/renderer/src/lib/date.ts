export function dateInputValue(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayInputValue() {
  return dateInputValue(new Date());
}

export function rowMatchesDate(value: Date | string | undefined, dateFilter: string) {
  if (!dateFilter || !value) return true;
  return dateInputValue(value) === dateFilter;
}

export function rowMatchesDateRange(value: Date | string | undefined, startDate: string, endDate: string) {
  if (!value) return false;
  const dateValue = dateInputValue(value);
  if (startDate && dateValue < startDate) return false;
  if (endDate && dateValue > endDate) return false;
  return true;
}

export function formatDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function formatDateOnly(value: Date | string) {
  return formatDateTime(value).slice(0, 10);
}

export function formatTimeOnly(value: Date | string) {
  return formatDateTime(value).slice(11);
}
