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
  const [locationMethod, setLocationMethod] = useState<'map' | 'current' | null>(null);
  const submitDebounceRef = useRef(0);
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
    
    const now = Date.now();
    if (now - submitDebounceRef.current < 500) return;
    submitDebounceRef.current = now;
    
    setIsSubmitting(true);
    onSubmit({ ...data, ...location });
    
    setTimeout(() => {
      reset();
      setLocationMethod(null);
      onClose();
      setIsSubmitting(false);
    }, 100);
  };

  const resetForm = () => {
    setLocationMethod(null);
    reset();
    onClose();
  };

  return (
    <>
      {/* DESKTOP - Brand New Layout Design */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[110] hidden lg:flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xl">
            {/* Click backdrop to close */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetForm}
              className="fixed inset-0 -z-10 cursor-pointer"
            />

            {/* Main Container - Two Column Layout */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-5xl bg-gradient-to-br from-slate-900 to-slate-950 rounded-3xl border border-white/10 shadow-2xl shadow-blue-900/30 overflow-hidden"
            >
              {/* Left Column: Location Selection (40%) */}
              <div className="hidden lg:flex lg:w-2/5 bg-gradient-to-b from-slate-800/50 to-slate-900 flex-col p-8 border-r border-white/5">
                <h3 className="text-2xl font-black text-white mb-1">📍 Location</h3>
                <p className="text-slate-400 text-sm font-medium mb-6">Required: Choose how to set location</p>

                {!location || !locationMethod ? (
                  <div className="space-y-3 flex flex-col flex-1">
                    {/* Use Current Location Button */}
                    <button
                      onClick={() => setLocationMethod('current')}
                      className="p-4 rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-blue-600/20 hover:from-blue-500/30 hover:to-blue-600/30 transition-all group text-left"
                    >
                      <p className="font-black text-white text-sm mb-1">📌 Use Current Location</p>
                      <p className="text-xs text-slate-400">Use your device's current position</p>
                    </button>

                    {/* Pin on Map Button */}
                    <button
                      onClick={() => setLocationMethod('map')}
                      className="p-4 rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 hover:from-emerald-500/30 hover:to-emerald-600/30 transition-all group text-left"
                    >
                      <p className="font-black text-white text-sm mb-1">🗺️ Pin on Map</p>
                      <p className="text-xs text-slate-400">Click the map to select exact location</p>
                    </button>

                    <p className="text-xs text-slate-500 text-center mt-auto">Close form to return to map and click your location</p>
                  </div>
                ) : (
                  <div className="space-y-4 flex flex-col flex-1">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex-1 flex flex-col justify-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-2">Coordinates</p>
                      <p className="text-xl font-black text-white mb-1">{location.lat.toFixed(6)}</p>
                      <p className="text-xl font-black text-white">{location.lng.toFixed(6)}</p>
                      <p className="text-[10px] text-slate-500 mt-3">Method: {locationMethod === 'current' ? 'Device Location' : 'Map Pin'}</p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => {
                        setLocationMethod(null);
                        resetForm();
                      }}
                      variant="secondary"
                      className="w-full bg-white/10 hover:bg-white/20 text-white rounded-xl h-[40px] font-bold text-sm"
                    >
                      Change Location
                    </Button>
                  </div>
                )}
              </div>

              {/* Right Column: Form Details (60%) */}
              <div className="w-full lg:w-3/5 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-gradient-to-r from-transparent to-blue-900/10">
                  <div>
                    <h2 className="text-3xl font-black text-white">Report Incident</h2>
                  </div>
                  <button
                    onClick={resetForm}
                    className="p-3 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all group"
                  >
                    <X size={22} className="group-hover:rotate-90 transition-transform duration-300" />
                  </button>
                </div>

                {/* Form Body */}
                {location && locationMethod ? (
                  <form onSubmit={handleSubmit(handleFormSubmit)} className="flex-1 overflow-y-auto flex flex-col">
                    <div className="px-8 py-6 space-y-5 flex-1">
                      {/* Category & Neighborhood */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Category</label>
                          <select
                            {...register('category')}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white font-bold text-sm"
                          >
                            <option value="crime">Crime</option>
                            <option value="traffic">Traffic</option>
                            <option value="infrastructure">Infrastructure</option>
                            <option value="weather">Weather</option>
                            <option value="gas">Gas Prices</option>
                            <option value="emergency">🚨 Emergency</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Neighborhood</label>
                          <select
                            {...register('neighborhood')}
                            className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white font-bold text-sm"
                          >
                            <option value="">Select Area</option>
                            <option value="Beltline">Beltline</option>
                            <option value="Kensington">Kensington</option>
                            <option value="Bridgeland">Bridgeland</option>
                            <option value="Mission">Mission</option>
                            <option value="Inglewood">Inglewood</option>
                            <option value="Bowness">Bowness</option>
                            <option value="Downtown">Downtown</option>
                          </select>
                          {errors.neighborhood && <p className="text-red-400 text-xs mt-1 font-bold">{errors.neighborhood.message}</p>}
                        </div>
                      </div>

                      {/* Title */}
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Title</label>
                        <Input
                          {...register('title')}
                          placeholder="e.g., Major collision on 17th Ave SW"
                          className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 rounded-xl h-[40px] font-bold px-3 text-sm"
                        />
                        {errors.title && <p className="text-red-400 text-xs mt-1 font-bold">{errors.title.message}</p>}
                      </div>

                      {/* Description */}
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Description</label>
                        <textarea
                          {...register('description')}
                          placeholder="What happened? What should neighbors know?"
                          rows={3}
                          className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none text-white placeholder:text-slate-600 font-medium text-sm"
                        />
                        {errors.description && <p className="text-red-400 text-xs mt-1 font-bold">{errors.description.message}</p>}
                      </div>

                      {/* Anonymous */}
                      <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          {...register('anonymous')}
                          className="h-4 w-4 rounded border-white/20 bg-slate-900 text-blue-500"
                        />
                        <div>
                          <p className="text-xs font-bold text-white">Post anonymously</p>
                          <p className="text-[10px] text-slate-400">Hide your identity</p>
                        </div>
                      </label>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-white/5 bg-gradient-to-r from-slate-800/30 via-slate-900/20 to-slate-800/30 px-8 py-5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={userProfile?.photoURL || 'https://ui-avatars.com/api/?name=Calgary+User&background=1e293b&color=fff'}
                          alt="Profile"
                          className="w-8 h-8 rounded-lg border border-white/10 object-cover flex-shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <p className="text-xs font-bold text-slate-300 truncate">
                          {isAnonymous ? 'ANONYMOUS' : userProfile?.displayName?.toUpperCase()}
                        </p>
                      </div>
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-5 h-[40px] font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm shadow-lg shadow-blue-500/20"
                      >
                        {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : 'Post Report'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-8 text-center">
                    <div>
                      <p className="text-slate-400 text-sm font-medium">Select a location method on the left to begin</p>
                    </div>
                  </div>
                )}
              </div>
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
                
                <div className="flex-1 overflow-auto no-scrollbar flex flex-col">
                  <h2 className="text-2xl font-black text-white tracking-tight mb-1">Report Incident</h2>
                  <p className="text-slate-400 text-xs font-medium mb-5">Help keep Calgary safe in real-time</p>

                  <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 flex-1 overflow-y-auto no-scrollbar pr-2">
                    {/* Category */}
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 block mb-2">
                        Category
                      </label>
                      <select
                        {...register('category')}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white font-bold text-sm appearance-none cursor-pointer"
                      >
                        <option value="crime" className="bg-slate-900">Crime</option>
                        <option value="traffic" className="bg-slate-900">Traffic</option>
                        <option value="infrastructure" className="bg-slate-900">Infrastructure</option>
                        <option value="weather" className="bg-slate-900">Weather</option>
                        <option value="gas" className="bg-slate-900">Gas Prices</option>
                        <option value="emergency" className="bg-slate-900">🚨 Emergency</option>
                      </select>
                    </div>

                    {/* Neighborhood */}
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 block mb-2">
                        Neighborhood
                      </label>
                      <select
                        {...register('neighborhood')}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white font-bold text-sm appearance-none cursor-pointer"
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
                      {errors.neighborhood && (
                        <p className="text-red-400 text-[10px] mt-1.5 font-bold">{errors.neighborhood.message}</p>
                      )}
                    </div>

                    {/* Title */}
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 block mb-2">
                        Report Title
                      </label>
                      <Input
                        {...register('title')}
                        placeholder="e.g., Major collision on 17th Ave"
                        className="bg-white/5 border-white/10 hover:bg-white/8 text-white placeholder:text-slate-600 rounded-xl h-[44px] font-bold px-3.5 text-sm"
                      />
                      {errors.title && (
                        <p className="text-red-400 text-[10px] mt-1.5 font-bold">{errors.title.message}</p>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 block mb-2">
                        Description
                      </label>
                      <textarea
                        {...register('description')}
                        placeholder="What happened, what should neighbors avoid?"
                        rows={4}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none text-white text-sm placeholder:text-slate-600 font-medium"
                      />
                      {errors.description && (
                        <p className="text-red-400 text-[10px] mt-1.5 font-bold">{errors.description.message}</p>
                      )}
                    </div>

                    {/* Anonymous Checkbox */}
                    <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        {...register('anonymous')}
                        className="h-4 w-4 rounded border-white/20 bg-slate-900 text-blue-500 focus:ring-blue-500/50"
                      />
                      <div>
                        <p className="text-xs font-bold text-white">Post anonymously</p>
                        <p className="text-[11px] text-slate-400">Hide your profile from others</p>
                      </div>
                    </label>

                    <div className="pt-2 pb-4">
                      <Button
                        type="submit"
                        disabled={isSubmitting || !location}
                        className="w-full h-[44px] text-sm font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white border-none shadow-lg shadow-blue-500/20 rounded-xl transition-all active:scale-[0.98]"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="animate-spin mr-2" size={18} />
                            Submitting...
                          </>
                        ) : (
                          'Submit Report'
                        )}
                      </Button>
                    </div>
                  </form>

                  {/* Footer Info */}
                  <div className="border-t border-white/5 bg-slate-800/30 p-4 space-y-3 text-xs mt-auto">
                    {/* Location */}
                    <div className="flex items-start gap-2.5">
                      <MapPin size={14} className="text-blue-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-200">
                          {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Select on map'}
                        </p>
                        <p className="text-slate-400 mt-0.5">Click map to refine location</p>
                      </div>
                    </div>

                    {/* User Info */}
                    <div className="flex items-center gap-2.5 pt-2">
                      <img
                        src={userProfile?.photoURL || 'https://ui-avatars.com/api/?name=Calgary+User&background=1e293b&color=fff'}
                        alt="Profile"
                        className="w-8 h-8 rounded-lg border border-white/10 object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-200 truncate text-xs">
                          {isAnonymous ? 'Anonymous' : (userProfile?.displayName || 'Calgary User')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </>
  );
}
