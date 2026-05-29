import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive/15 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:text-destructive',
        outline:
          'border-border text-foreground hover:bg-accent',
        success:
          'border-transparent bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary',
        warning:
          'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
        info:
          'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
        // New variants
        muted:
          'border-transparent bg-muted text-muted-foreground',
        'outline-primary':
          'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10',
        'outline-success':
          'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 dark:text-primary',
        'outline-warning':
          'border-amber-500/30 bg-amber-500/5 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400',
        'outline-destructive':
          'border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10',
        premium:
          'border-transparent bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm',
        new:
          'border-transparent bg-primary text-white shadow-sm',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-px text-[10px]',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode;
}

function Badge({ className, variant, size, icon, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
