"use client";

import { useEffect, useMemo, useState } from "react";

export function useListPagination<T>(items: T[], pageSize = 7) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  useEffect(() => {
    setPage(1);
  }, [total]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return {
    page,
    setPage,
    pageCount,
    total,
    pageSize,
    rangeStart,
    rangeEnd,
    items: paginatedItems,
    hasMultiplePages: pageCount > 1,
  };
}
