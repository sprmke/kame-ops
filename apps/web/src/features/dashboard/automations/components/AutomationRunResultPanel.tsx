import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { AutomationRunResultTone } from "@/lib/automation-run-summary";

type AutomationRunResultPanelProps = {
  tone: AutomationRunResultTone;
  lines: string[];
};

const TONE_CONFIG: Record<
  AutomationRunResultTone,
  {
    container: string;
    icon: string;
    primary: string;
    secondary: string;
    Icon: LucideIcon;
  }
> = {
  success: {
    container: "border-success/30 bg-success/10",
    icon: "text-[hsl(var(--success))]",
    primary: "text-foreground",
    secondary: "text-muted-foreground",
    Icon: CheckCircle2,
  },
  neutral: {
    container: "border-border/80 bg-muted/25",
    icon: "text-muted-foreground",
    primary: "text-foreground",
    secondary: "text-muted-foreground",
    Icon: Info,
  },
  warning: {
    container: "border-warning/40 bg-warning/10",
    icon: "text-[hsl(var(--warning-foreground))] dark:text-warning",
    primary: "text-foreground",
    secondary: "text-muted-foreground",
    Icon: AlertTriangle,
  },
  error: {
    container: "border-destructive/30 bg-destructive/10",
    icon: "text-destructive",
    primary: "text-destructive",
    secondary: "text-destructive/90",
    Icon: AlertCircle,
  },
};

export function AutomationRunResultPanel({
  tone,
  lines,
}: AutomationRunResultPanelProps) {
  if (lines.length === 0) return null;

  const config = TONE_CONFIG[tone];
  const Icon = config.Icon;
  const [primary, ...secondary] = lines;

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-lg border px-3 py-2.5",
        config.container,
      )}
    >
      <Icon
        className={cn("mt-0.5 h-4 w-4 shrink-0", config.icon)}
        aria-hidden
      />
      <div className="min-w-0 space-y-1">
        <p className={cn("text-sm font-medium leading-snug", config.primary)}>
          {primary}
        </p>
        {secondary.map((line) => (
          <p
            key={line}
            className={cn("text-xs leading-relaxed", config.secondary)}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
