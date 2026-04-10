import { Drawer } from 'vaul';
import { ReactNode } from 'react';
import { cn } from '@/src/lib/utils';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
}

export default function MobileBottomSheet({ isOpen, onClose, children, title, description }: MobileBottomSheetProps) {
  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" onClick={onClose} />
        <Drawer.Content className="bg-slate-950 flex flex-col rounded-t-[2rem] h-[85vh] mt-24 fixed bottom-0 left-0 right-0 z-[101] border-t border-white/10 shadow-2xl focus:outline-none">
          <div className="p-4 bg-slate-950 rounded-t-[2rem] flex-1 overflow-y-auto no-scrollbar">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-800 mb-8" />
            
            <Drawer.Title className={cn("font-black text-2xl text-white mb-2 tracking-tight", !title && "sr-only")}>
              {title || "Information Detail"}
            </Drawer.Title>
            <Drawer.Description className={cn("text-slate-400 text-sm leading-relaxed", !description && "sr-only")}>
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
