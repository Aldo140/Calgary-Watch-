import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/src/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    /**
     * No colour utilities on the shadows.
     *
     * `shadow-blue-500/20` does not only tint this button's own shadow — it
     * sets `--tw-shadow-color`, which then repaints whatever `shadow-[…]` a
     * caller passes through `className`. Every hard-offset press placed on a
     * Button in this app was rendering blue-tinted rather than the colour the
     * author wrote, including the SOS button's red one. `shadow-lg` alone
     * leaves the caller's shadow the colour they asked for.
     */
    const variants = {
      primary: 'bg-blue-600 text-[#fff] hover:bg-blue-700 shadow-lg',
      secondary: 'bg-slate-800 text-[#fff] hover:bg-slate-900 shadow-lg',
      outline: 'border border-slate-200 bg-transparent hover:bg-slate-50 text-slate-900',
      ghost: 'bg-transparent hover:bg-slate-100 text-slate-700',
      danger: 'bg-red-600 text-[#fff] hover:bg-red-700 shadow-lg',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2',
      lg: 'px-6 py-3 text-lg',
      icon: 'p-2',
    };

    /**
     * The default press yields to an author's own.
     *
     * `active:scale-95` and a caller's `active:translate-x-1 …` are different
     * properties, so both apply and the button shrinks *and* slides. A caller
     * cannot override it from `className` either, since same-variant utilities
     * are resolved by stylesheet order rather than by argument order. So the
     * base press only applies when the caller has not written one.
     */
    const hasOwnPress = typeof className === 'string' && className.includes('active:');

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-medium transition-all disabled:opacity-50 disabled:pointer-events-none',
          !hasOwnPress && 'active:scale-95',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
