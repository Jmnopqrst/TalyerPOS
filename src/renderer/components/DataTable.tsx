import type { ReactNode } from "react";

interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  title: string;
  action?: ReactNode;
  footer?: ReactNode;
  emptyMessage?: ReactNode;
  rows: T[];
  columns: Column<T>[];
}

export function DataTable<T>({ title, action, footer, emptyMessage = "No records found.", rows, columns }: DataTableProps<T>) {
  return (
    <section className="panel table-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length}>{emptyMessage}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </section>
  );
}
