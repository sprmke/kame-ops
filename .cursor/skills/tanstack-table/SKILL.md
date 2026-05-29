---
name: tanstack-table
description: TanStack Table v8 skill for data tables: column definitions, sorting, filtering, pagination, and actions column. Use when building bookings table, payments table, or any list that needs columns and row actions.
---

# TanStack Table v8 Skill

This skill covers TanStack Table v8 for type-safe, headless data tables (bookings, payments, etc.).

## Tech Stack

- **Library**: TanStack Table v8 (React Table)
- **UI**: shadcn/ui Table components + custom column cells
- **Project**: Column helper pattern, DataTable wrapper if present

## File Locations

- Shared table: `apps/web/src/components/shared/DataTable/` (if exists)
- Feature tables: per feature in `features/*/components/` (e.g. `PaymentsTableView`, bookings table)

## Column Definition Pattern

```typescript
import { createColumnHelper } from '@tanstack/react-table';
import { type Booking } from '../types';

const columnHelper = createColumnHelper<Booking>();

const columns = [
  columnHelper.accessor('bookingNumber', {
    header: 'Booking #',
    cell: ({ getValue, row }) => (
      <Link href={`/bookings/${row.original.id}`}>{getValue()}</Link>
    ),
  }),
  columnHelper.accessor('guestName', { header: 'Guest' }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: ({ getValue }) => <StatusBadge status={getValue()} />,
  }),
  columnHelper.accessor('checkInDate', {
    header: 'Check-in',
    cell: ({ getValue }) => format(getValue(), 'MMM d, yyyy'),
  }),
  columnHelper.display({
    id: 'actions',
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onView(row.original.id)}>View</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(row.original.id)}>Edit</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  }),
];
```

## Usage with DataTable

```tsx
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/DataTable'; // or local wrapper

export function BookingsTable({ data }: { data: Booking[] }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(), // if sorting
    getFilteredRowModel: getFilteredRowModel(), // if filtering
  });

  return <DataTable table={table} />;
}
```

## Sorting & Filtering

- Enable sorting with `getSortedRowModel()` and column `meta` or `enableSorting`.
- Filtering: controlled state + `getFilteredRowModel()` or server-side filter (tRPC input).
- Pagination: either client-side (`getPaginationRowModel()`) or server-side (tRPC `page`/`limit`).

## Conventions

- Use `columnHelper.accessor` for data columns and `columnHelper.display` for actions or composite cells.
- Prefer typed `Booking` (or relevant type) with `createColumnHelper<Booking>()`.
- Keep actions in a single “actions” column with dropdown; use `aria-label` on icon-only buttons.
- Tables should be responsive (e.g. cards on small screens per 05-components / 13-ui-ux-design rules).

## Reference

- `.cursor/rules/05-components.mdc` – Data Table example
- Project pattern: `PaymentsTableView`, `BookingsCalendarView` (calendar is different; for list-of-rows use table)
