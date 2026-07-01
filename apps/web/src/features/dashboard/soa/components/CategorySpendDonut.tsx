"use client";

import { useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { formatPhpAmount } from "@/lib/utils/format-money";
import { CANNOT_ANALYZE_SLUG } from "@/lib/transactions/categories";

import { categoryChartColor } from "../lib/category-chart-styles";
import type { CategorySpendRow } from "../lib/category-analytics";

type DonutSlice = {
  name: string;
  value: number;
  slug: string;
  color: string;
};

type HoverState = {
  slice: DonutSlice;
  x: number;
  y: number;
};

function buildDonutSlices(rows: CategorySpendRow[]): DonutSlice[] {
  const top = rows.slice(0, 6);
  const restTotal = rows.slice(6).reduce((sum, row) => sum + row.total, 0);

  const slices: DonutSlice[] = top.map((row, index) => ({
    name: row.label,
    value: row.total,
    slug: row.slug,
    color: categoryChartColor(row.slug, index),
  }));

  if (restTotal > 0) {
    slices.push({
      name: "Other",
      value: restTotal,
      slug: "other",
      color: categoryChartColor("other", slices.length),
    });
  }

  return slices;
}

type CategorySpendDonutProps = {
  rows: CategorySpendRow[];
  spendTotal: number;
};

function DonutSliceTooltip({
  hover,
  spendTotal,
}: {
  hover: HoverState;
  spendTotal: number;
}) {
  const pct =
    spendTotal > 0
      ? Math.round((hover.slice.value / spendTotal) * 1000) / 10
      : 0;

  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[min(100%,12rem)]"
      style={{
        left: hover.x,
        top: hover.y,
        transform: "translate(-50%, calc(-100% - 10px))",
      }}
    >
      <div className="rounded-lg border border-border/80 bg-card px-3 py-2 shadow-elevated">
        <p className="text-sm font-medium">{hover.slice.name}</p>
        <p className="text-sm tabular-nums text-foreground">
          {formatPhpAmount(hover.slice.value)}
        </p>
        <p className="text-xs text-muted-foreground">{pct}% of spend</p>
      </div>
    </div>
  );
}

export function CategorySpendDonut({
  rows,
  spendTotal,
}: CategorySpendDonutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const slices = buildDonutSlices(rows);
  const [hover, setHover] = useState<HoverState | null>(null);
  const animationKey = slices
    .map((slice) => `${slice.slug}:${Math.round(slice.value)}`)
    .join("|");

  function updateHover(slice: DonutSlice | undefined, event: ReactMouseEvent) {
    if (!slice || !containerRef.current) {
      setHover(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setHover({
      slice,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }

  if (!slices.length) {
    return (
      <p className="flex h-full min-h-[14rem] items-center justify-center text-sm text-muted-foreground">
        No categorized spend yet.
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative mx-auto h-64 w-full max-w-xs transition-opacity duration-700 ease-out sm:h-72"
    >
      {hover ? (
        <DonutSliceTooltip hover={hover} spendTotal={spendTotal} />
      ) : null}
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            key={animationKey}
            data={slices}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="hsl(var(--background))"
            strokeWidth={2}
            isAnimationActive
            animationDuration={800}
            animationEasing="ease-out"
            onMouseEnter={(data, index, event) => {
              updateHover(slices[index], event);
            }}
            onMouseMove={(_, index, event) => {
              updateHover(slices[index], event);
            }}
            onMouseLeave={() => {
              setHover(null);
            }}
          >
            {slices.map((slice) => (
              <Cell
                key={slice.name}
                fill={slice.color}
                opacity={hover && hover.slice.name !== slice.name ? 0.45 : 1}
                className="transition-opacity duration-150"
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Total
        </span>
        <span
          key={animationKey}
          className="font-display text-xl font-bold tabular-nums tracking-tight transition-all duration-700 ease-out sm:text-2xl"
        >
          {formatPhpAmount(spendTotal)}
        </span>
      </div>
    </div>
  );
}

export function CategorySpendLegend({ rows }: { rows: CategorySpendRow[] }) {
  const slices = buildDonutSlices(rows).filter(
    (slice) => slice.slug !== CANNOT_ANALYZE_SLUG,
  );

  if (!slices.length) return null;

  return (
    <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
      {slices.map((slice) => (
        <li
          key={slice.name}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: slice.color }}
            aria-hidden
          />
          <span className="max-w-[8rem] truncate">{slice.name}</span>
        </li>
      ))}
    </ul>
  );
}
