import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Input } from '@/src/components/ui/Input';
import { X, MapPin, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef } from 'react';
import { Drawer } from 'vaul';

const incidentSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  category: z.enum(['crime', 'traffic', 'infrastructure', 'weather', 'gas', 'emergency']),
  neighborhood: z.string().min(2, 'Neighborhood is required'),
  anonymous: z.boolean(),
});

export type IncidentFormData = z.infer<typeof incidentSchema>;

interface IncidentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: IncidentFormData & { lat: number; lng: number }) => void;
  location: { lat: number; lng: number } | null;
  userProfile: {
    displayName: string;
    email: string;
    photoURL: string;
  } | null;
}

export default function IncidentForm({ isOpen, onClose, onSubmit, location, userProfile }: IncidentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitDebounceRef = useRef(0); // Prevent double-click submissions
  const { register, handleSubmit, watch, formState: { errors }, reset } = useForm<IncidentFormData>({
    resolver: zodResolver(incidentSchema),
    defaultValues: {
      category: 'crime',
      anonymous: false,
    },
  });
  const isAnonymous = watch('anonymous');
  const selectedCategory = watch('category');

  const handleFormSubmit = async (data: IncidentFormData) => {
    if (!location) return;
    
    // Debounce: prevent double-click within 500ms
    const now = Date.now();
    if (now - submitDebounceRef.current < 500) return;
    submitDebounceRef.current = now;
    
    setIsSubmitting(true);
    
    // Submit to server (fire-and-forget, handled by MapPage's handleIncidentSubmit)
    onSubmit({ ...data, ...location });
    
    // Immediate feedback: close form instantly after collecting data
    // Form close and reset happens immediately, Firestore write happens in background
    setTimeout(() => {
      reset();
      onClose();
      setIsSubmitting(false);
    }, 100); // Brief delay for visual feedback, but essentially instant
  };

  const FormContent = () => (
    <div className="flex flex-col h-full min-h-0">
      <div className="mb-4 lg:mb-5 shrink-0">
        <h2 className="text-3xl lg:text-[2.1rem] font-black text-white tracking-tight leading-tight">Report Incident</h2>
        <p className="text-slate-400 text-sm font-medium mt-1">
          Fast, structured, and easier to review before posting.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(handleFormSubmit)}
        className="overflow-y-auto lg:overflow-visible no-scrollbar flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-5"
      >
        <div className="space-y-4 lg:pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Category</label>
              <select
                {...register('category')}
                className="w-full px-4 py-2.5 rounded-2xl border border-white/10 bg-white/5 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white font-bold appearance-none cursor-pointer hover:bg-white/10"
              >
                <option value="crime" className="bg-slate-900">Crime</option>
                <option value="traffic" className="bg-slate-900">Traffic</option>
                <option value="infrastructure" className="bg-slate-900">Infrastructure</option>
                <option value="weather" className="bg-slate-900">Weather</option>
                <option value="gas" className="bg-slate-900">Gas Prices</option>
                <option value="emergency" className="bg-slate-900">🚨 Emergency</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Neighborhood</label>
              <select
                {...register('neighborhood')}
                className="w-full px-4 py-2.5 rounded-2xl border border-white/10 bg-white/5 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white font-bold appearance-none cursor-pointer hover:bg-white/10"
              >
                <option value="" className="bg-slate-900">Select Area</option>
                <option value="Beltline" className="bg-slate-900">Beltline</option>
                <option value="Kensington" className="bg-slate-900">Kensington</option>
                <option value="Bridgeland" className="bg-slate-900">Bridgeland</option>
                <option value="Mission" className="bg-slate-900">Mission</option>
                <option value="Inglewood" className="bg-slate-900">Inglewood</option>
                <option value="Bowness" className="bg-slate-900">Bowness</option>
                <option value="Downtown" className="bg-slate-900">Downtown</option>
              </select>
              {errors.neighborhood && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.neighborhood.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Report Title</label>
            <Input
              {...register('title')}
              placeholder="e.g., Major collision on 17th Ave"
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 rounded-2xl h-[46px] font-bold px-4"
            />
            {errors.title && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Detailed Description</label>
            <textarea
              {...register('description')}
              placeholder="What happened, what should neighbors avoid, and what is the current situation?"
              rows={5}
              className="w-full px-4 py-3 rounded-2xl border border-white/10 bg-white/5 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none text-white placeholder:text-slate-600 font-medium"
            />
            {errors.description && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.description.message}</p>}
          </div>
        </div>

        <div className="mt-4 lg:mt-0 space-y-3 lg:space-y-4 lg:sticky lg:top-0 self-start">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Posting Summary</p>
            <p className="text-xs font-bold text-white">{selectedCategory?.toUpperCase() || 'INCIDENT'}</p>
            <p className="text-[11px] text-slate-400 mt-1">This report will appear on the live city map in real time.</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Map Location</p>
            <div className="flex items-center gap-2 text-slate-200 text-xs font-bold">
              <MapPin size={16} className="text-blue-400 shrink-0" />
              {location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : 'Select on map'}
            </div>
            <p className="text-[10px] text-slate-500 italic">Tap map to refine location.</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 flex items-center gap-3">
            <img
              src={userProfile?.photoURL || 'https://ui-avatars.com/api/?name=Calgary+User&background=1e293b&color=fff'}
              alt="Profile"
              className="w-10 h-10 rounded-full border border-white/20 object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {isAnonymous ? 'Posting as Anonymous' : (userProfile?.displayName || 'Calgary User')}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {isAnonymous ? 'Identity hidden for this report' : (userProfile?.email || 'No email')}
              </p>
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 cursor-pointer hover:bg-white/10 transition-colors">
            <input
              type="checkbox"
              {...register('anonymous')}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-900 text-blue-500 focus:ring-blue-500/50"
            />
            <div>
              <p className="text-xs font-bold text-white">Post anonymously</p>
              <p className="text-[11px] text-slate-400">Hide your profile from other users for this report.</p>
            </div>
          </label>

          <Button
            type="submit"
            disabled={isSubmitting || !location}
            className="w-full h-[50px] text-base font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-none shadow-xl shadow-blue-500/20 rounded-2xl transition-all active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin mr-3" size={24} />
                Processing Report...
              </>
            ) : (
              'Submit Live Report'
            )}
          </Button>
        </div>
      </form>
    </div>
  );

  return (
    <>
      {/* Desktop Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[110] hidden lg:flex items-start justify-center pt-8 pb-6 px-4 bg-slate-950/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-5xl"
            >
              <Card className="relative p-7 xl:p-8 bg-slate-900/95 backdrop-blur-3xl border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden max-h-[92vh] flex flex-col rounded-[2.25rem]">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
                
                <button
                  onClick={onClose}
                  className="absolute top-6 right-6 p-3 text-slate-400 hover:text-white hover:bg-white/10 rounded-2xl transition-all z-20 group"
                >
                  <X size={20} className="group-hover:rotate-90 transition-transform duration-150" />
                </button>

                <FormContent />
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Drawer */}
      <div className="lg:hidden">
        <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 h-[92vh] z-[111] outline-none">
              <div className="h-full bg-slate-950 rounded-t-[3rem] overflow-hidden border-t border-white/10 flex flex-col p-6">
                <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-white/10 mb-6" />
                <Drawer.Title className="sr-only">Report Incident</Drawer.Title>
                <Drawer.Description className="sr-only">Help keep Calgary safe by reporting what's happening in real-time.</Drawer.Description>
                <div className="flex-1 overflow-hidden">
                  <FormContent />
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </>
  );
}
