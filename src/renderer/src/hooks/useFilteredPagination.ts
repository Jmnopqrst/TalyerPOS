import { useEffect, useState } from "react";

const PAGE_SIZE = 10;

export function useFilteredPagination<T>(rows: T[], dependencies: unknown[] = []) {
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  useEffect(() => {
    setPage(1);
    setIsLoading(true);
    const timeout = window.setTimeout(() => setIsLoading(false), 140);
    return () => window.clearTimeout(timeout);
  }, dependencies);

  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return { page: currentPage, pageCount, pagedRows, setPage, isLoading };
}
