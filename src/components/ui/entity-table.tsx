"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  Pencil,
  Trash2,
  Plus,
  Download,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export { ArrowUpDown };

interface EntityTableProps<TData> {
  title: string;
  columns: ColumnDef<TData>[];
  data: TData[];
  loading?: boolean;
  onCreateNew?: () => void;
  onEdit?: (row: TData) => void;
  onDelete?: (row: TData) => void;
  onExport?: (data: TData[]) => void;
  onImport?: (file: File) => void;
}

export function EntityTable<TData>({
  title,
  columns,
  data,
  loading = false,
  onCreateNew,
  onEdit,
  onDelete,
  onExport,
  onImport,
}: EntityTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const importRef = React.useRef<HTMLInputElement>(null);

  const actionColumn: ColumnDef<TData> = {
    id: "actions",
    header: "Action",
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(row.original)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    ),
  };

  const allColumns = onEdit || onDelete ? [...columns, actionColumn] : columns;

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: false,
  });

  const { pageIndex, pageSize } = pagination;
  const pageCount = table.getPageCount();
  const filteredRowCount = table.getFilteredRowModel().rows.length;
  const from = filteredRowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, filteredRowCount);

  const handleExport = () => {
    if (onExport) {
      onExport(table.getFilteredRowModel().rows.map((r) => r.original));
    }
  };

  const handleImportClick = () => importRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImport) {
      onImport(file);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">{title}</h1>
        {onCreateNew && (
          <Button
            onClick={onCreateNew}
            className="bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-600 text-white w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create New
          </Button>
        )}
      </div>

      {/* Card */}
      <div className="rounded-md border bg-card p-4 space-y-4 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Left */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Show
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) =>
                setPagination((p) => ({
                  ...p,
                  pageSize: Number(v),
                  pageIndex: 0,
                }))
              }
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">entries</span>

            {/* Export */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleExport}
              disabled={!onExport}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>

            {/* Import */}
            <>
              <input
                ref={importRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleImportClick}
                disabled={!onImport}
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </Button>
            </>
          </div>

          {/* Right: search */}
          <Input
            placeholder="Search..."
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="h-8 w-full sm:w-[220px]"
          />
        </div>

        {/* Table wrapper with horizontal scroll */}
        <div className="overflow-x-auto -mx-4 -mb-4 px-4 pb-4">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-b border-border">
                  {hg.headers.map((header) => (
                    <TableHead key={header.id} className="font-semibold">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={allColumns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={allColumns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No results found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination footer */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Showing {from} to {to} of {filteredRowCount} entries
          </p>
          <div className="flex items-center gap-1 overflow-x-auto">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              ←
            </Button>
            {Array.from({ length: pageCount }, (_, i) => i).map((i) => (
              <Button
                key={i}
                variant={pageIndex === i ? "default" : "outline"}
                size="icon"
                className={`h-8 w-8 flex-shrink-0 ${pageIndex === i ? "bg-blue-600 text-white hover:bg-blue-700" : ""}`}
                onClick={() => table.setPageIndex(i)}
              >
                {i + 1}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
