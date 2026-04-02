import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/src/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full px-4 py-2 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400 text-slate-900',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };
