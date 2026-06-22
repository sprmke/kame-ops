"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";

type ClickableTableRowProps = ComponentProps<typeof TableRow> & {
  href?: string;
  onRowClick?: () => void;
  disabled?: boolean;
};

export function ClickableTableRow({
  href,
  onRowClick,
  disabled,
  className,
  onClick,
  onKeyDown,
  children,
  ...props
}: ClickableTableRowProps) {
  const router = useRouter();
  const interactive = !disabled && Boolean(href || onRowClick);

  const navigate = () => {
    if (href) router.push(href as Route);
    else onRowClick?.();
  };

  const handleClick = (e: MouseEvent<HTMLTableRowElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || !interactive) return;
    navigate();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || !interactive) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate();
    }
  };

  return (
    <TableRow
      className={cn(
        interactive &&
          "cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className,
      )}
      tabIndex={interactive ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </TableRow>
  );
}

/** Wrap action menus/buttons so row click does not fire. */
export function TableRowActions({
  className,
  onClick,
  onKeyDown,
  ...props
}: ComponentProps<typeof TableCell>) {
  return (
    <TableCell
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        onKeyDown?.(e);
      }}
      {...props}
    />
  );
}
