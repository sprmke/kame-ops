import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

type StatusVariant =
  | "success"
  | "warning"
  | "destructive"
  | "muted"
  | "default";

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  success:
    "border-success/30 bg-success/10 text-success dark:text-[hsl(var(--success))]",
  warning:
    "border-warning/40 bg-warning/15 text-[hsl(var(--warning-foreground))] dark:text-warning",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
  default: "",
};

interface StatusBadgeProps {
  label: string;
  variant?: StatusVariant;
  className?: string;
}

export function StatusBadge({
  label,
  variant = "default",
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(VARIANT_CLASSES[variant], className)}
    >
      {label}
    </Badge>
  );
}
