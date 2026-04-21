import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/src/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'solid';
  theme?: 'dark' | 'light';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'glass', theme = 'dark', ...props }, ref) => {
    const isDark = theme !== 'light';
    
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl border p-4 shadow-xl backdrop-blur-md',
          variant === 'glass' 
            ? isDark 
              ? 'bg-white/5 border-white/20'
              : 'bg-white/80 border-stone-200/60'
            : isDark
              ? 'bg-slate-900 border-white/10'
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
