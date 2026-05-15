export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function valueMatchesSearch(searchTerm: string, values: Array<string | number | null | undefined>) {
  const query = normalizeSearch(searchTerm);
  if (!query) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}
