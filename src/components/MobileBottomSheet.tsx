import { Drawer } from 'vaul';
import { ReactNode } from 'react';
import { cn } from '@/src/lib/utils';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
  theme?: 'dark' | 'light';
}

export default function MobileBottomSheet({ isOpen, onClose, children, title, description, theme = 'dark' }: MobileBottomSheetProps) {
  const dark = theme !== 'light';

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay 
          className={cn(
            'fixed inset-0 backdrop-blur-sm z-[100]',
            dark ? 'bg-black/40' : 'bg-black/20'
          )} 
          onClick={onClose} 
        />
        <Drawer.Content className={cn(
          'flex flex-col rounded-t-[2rem] h-[85vh] mt-24 fixed bottom-0 left-0 right-0 z-[101] border-t shadow-2xl focus:outline-none',
          dark 
            ? 'bg-slate-950 border-white/10' 
            : 'bg-[#fffaf3] border-stone-200/80'
        )}>
          <div className={cn(
            'p-4 rounded-t-[2rem] flex-1 overflow-y-auto no-scrollbar',
            dark ? 'bg-slate-950' : 'bg-[#fffaf3]'
          )}>
            <div className={cn(
              'mx-auto w-12 h-1.5 flex-shrink-0 rounded-full mb-8',
              dark ? 'bg-slate-800' : 'bg-stone-300'
            )} />
            
            <Drawer.Title className={cn(
              "font-black text-2xl mb-2 tracking-tight",
              !title && "sr-only",
              dark ? "text-white" : "text-slate-900"
            )}>
              {title || "Information Detail"}
            </Drawer.Title>
            <Drawer.Description className={cn(
              "text-sm leading-relaxed",
              !description && "sr-only",
              dark ? "text-slate-400" : "text-stone-600"
            )}>
              {description || "Detailed information about the selected item."}
            </Drawer.Description>
            
            <div className="flex flex-col h-full mt-6">
              {children}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
