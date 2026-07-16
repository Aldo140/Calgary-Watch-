import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/src/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'solid';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'glass', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl border p-4 shadow-xl backdrop-blur-md',
          variant === 'glass'
            ? 'bg-white/80 border-stone-200/60'
            : 'bg-white border-stone-200',
          className
        )}
        {...props}
      />
    );
  }
);

Card.displayName = 'Card';

export { Card };
