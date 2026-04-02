import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { IncidentCategory } from '@/src/types';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Input } from '@/src/components/ui/Input';
import { X, MapPin, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { Drawer } from 'vaul';
import { cn } from '@/src/lib/utils';

const incidentSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  category: z.enum(['crime', 'traffic', 'infrastructure', 'weather', 'gas']),
  neighborhood: z.string().min(2, 'Neighborhood is required'),
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
});

type IncidentFormData = z.infer<typeof incidentSchema>;

interface IncidentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: IncidentFormData & { lat: number; lng: number }) => Promise<void>;
  location: { lat: number; lng: number } | null;
}

export default function IncidentForm({ isOpen, onClose, onSubmit, location }: IncidentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors }, reset } = useForm<IncidentFormData>({
    resolver: zodResolver(incidentSchema),
    defaultValues: {
      category: 'crime',
    },
  });

  const handleFormSubmit = async (data: IncidentFormData) => {
    if (!location) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ ...data, ...location });
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to submit incident:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const FormContent = () => (
    <div className="flex flex-col h-full">
      <div className="mb-8 shrink-0">
        <h2 className="text-3xl font-black text-white tracking-tight">Report Incident</h2>
        <p className="text-slate-400 text-sm font-medium mt-1">Help keep Calgary safe by reporting what's happening in real-time.</p>
      </div>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 overflow-y-auto pr-2 no-scrollbar flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Category</label>
            <select
              {...register('category')}
              className="w-full px-5 py-3 rounded-2xl border border-white/10 bg-white/5 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white font-bold appearance-none cursor-pointer hover:bg-white/10"
            >
              <option value="crime" className="bg-slate-900">Crime</option>
              <option value="traffic" className="bg-slate-900">Traffic</option>
              <option value="infrastructure" className="bg-slate-900">Infrastructure</option>
              <option value="weather" className="bg-slate-900">Weather</option>
              <option value="gas" className="bg-slate-900">Gas Prices</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Neighborhood</label>
            <select
              {...register('neighborhood')}
              className="w-full px-5 py-3 rounded-2xl border border-white/10 bg-white/5 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white font-bold appearance-none cursor-pointer hover:bg-white/10"
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
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Map Location</label>
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-white/10 bg-white/5 text-slate-200 text-sm font-bold h-[52px]">
            <MapPin size={18} className="text-blue-500 shrink-0" />
            {location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : 'Select on map'}
          </div>
          <p className="text-[10px] text-slate-500 font-medium italic ml-1">Click anywhere on the map to update the precise location</p>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Report Title</label>
          <Input
            {...register('title')}
            placeholder="e.g., Major collision on 17th Ave"
            className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 rounded-2xl h-12 font-bold px-5"
          />
          {errors.title && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.title.message}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Detailed Description</label>
          <textarea
            {...register('description')}
            placeholder="Provide specific details about what you observed..."
            rows={4}
            className="w-full px-5 py-4 rounded-2xl border border-white/10 bg-white/5 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none text-white placeholder:text-slate-600 font-medium"
          />
          {errors.description && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Your Name</label>
            <Input
              {...register('name')}
              placeholder="John Doe"
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 rounded-2xl h-12 font-bold px-5"
            />
            {errors.name && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Email Address</label>
            <Input
              {...register('email')}
              placeholder="john@example.com"
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 rounded-2xl h-12 font-bold px-5"
            />
            {errors.email && <p className="text-red-500 text-[10px] mt-1 font-bold">{errors.email.message}</p>}
          </div>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting || !location}
          className="w-full mt-6 h-14 text-lg font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-none shadow-xl shadow-blue-500/20 rounded-2xl transition-all active:scale-[0.98]"
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
      </form>
    </div>
  );

  return (
    <>
      {/* Desktop Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[110] hidden lg:flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-xl"
            >
              <Card className="relative p-10 bg-slate-900/95 backdrop-blur-3xl border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden max-h-[90vh] flex flex-col rounded-[2.5rem]">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
                
                <button
                  onClick={onClose}
                  className="absolute top-6 right-6 p-3 text-slate-400 hover:text-white hover:bg-white/10 rounded-2xl transition-all z-20 group"
                >
                  <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
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
