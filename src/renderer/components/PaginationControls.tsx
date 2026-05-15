export function PaginationControls({ page, pageCount, total, onPageChange }: { page: number; pageCount: number; total: number; onPageChange: (page: number) => void }) {
  const visiblePages = Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter((pageNumber) => pageCount <= 7 || pageNumber === 1 || pageNumber === pageCount || Math.abs(pageNumber - page) <= 1);

  return (
    <div className="pagination-bar">
      <span>{total === 0 ? "No records" : `Page ${page} of ${pageCount}`}</span>
      <div className="pagination-controls">
        <button className="table-action" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        {visiblePages.map((pageNumber, index) => (
          <span className="pagination-page-group" key={pageNumber}>
          {index > 0 && pageNumber - visiblePages[index - 1] > 1 && <span className="pagination-ellipsis">...</span>}
          <button className={pageNumber === page ? "table-action active-page" : "table-action"} key={pageNumber} onClick={() => onPageChange(pageNumber)}>
            {pageNumber}
          </button>
          </span>
        ))}
        <button className="table-action" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}
