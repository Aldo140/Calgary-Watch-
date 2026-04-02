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
      {/* DESKTOP - Streamlined Single-Column Journey */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[115] hidden lg:flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xl pointer-events-auto">
            {/* Click backdrop to close */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetForm}
              className="absolute inset-0 cursor-pointer pointer-events-auto"
            />

            {/* Main Container - Single Column Flow */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-50 w-full max-w-2xl max-h-[90vh] bg-gradient-to-br from-slate-900 via-slate-950 to-slate-950 rounded-3xl border border-white/10 shadow-2xl shadow-blue-900/40 overflow-hidden flex flex-col pointer-events-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-gradient-to-r from-slate-900/80 to-blue-900/20">
                <div>
                  <h2 className="text-2xl font-black text-white">Keep Calgary Safe</h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Report what's happening in real-time</p>
                </div>
                <button
                  onClick={resetForm}
                  className="p-2.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all group"
                >
                  <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {/* STEP 1: Location Selection */}
                {!location || !locationMethod ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="px-8 py-8 space-y-6"
                  >
                    <div>
                      <h3 className="text-lg font-black text-white mb-1">📍 Step 1: Select Location</h3>
                      <p className="text-sm text-slate-400">This helps us pin the incident on the map</p>
                    </div>

                    <div className="space-y-3">
                      {/* Use Current Location - Primary Action */}
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setLocationMethod('current')}
                        className="w-full p-5 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-600/20 to-blue-700/20 hover:from-blue-600/30 hover:to-blue-700/30 transition-all group text-left shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-black text-white text-base">📌 Use My Current Location</p>
                            <p className="text-xs text-slate-300 mt-1.5">Fast & accurate - uses your device GPS</p>
                          </div>
                          <div className="text-blue-400 group-hover:translate-x-1 transition-transform">→</div>
                        </div>
                      </motion.button>

                      {/* Pin on Map - Secondary Action */}
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setLocationMethod('map')}
                        className="w-full p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-600/20 to-emerald-700/20 hover:from-emerald-600/30 hover:to-emerald-700/30 transition-all group text-left shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-black text-white text-base">🗺️ Pin Exact Location on Map</p>
                            <p className="text-xs text-slate-300 mt-1.5">Close this, click the map where it happened</p>
                          </div>
                          <div className="text-emerald-400 group-hover:translate-x-1 transition-transform">→</div>
                        </div>
                      </motion.button>
                    </div>

                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 mt-6">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Pro Tip</p>
                      <p className="text-xs text-slate-300 mt-2">Using your current location shares your general area. You can still change it on the map if needed.</p>
                    </div>
                  </motion.div>
                ) : (
                  /* STEP 2: Report Details */
                  <motion.form
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    onSubmit={handleSubmit(handleFormSubmit)}
                    className="px-8 py-8 space-y-6 flex flex-col h-full"
                  >
                    {/* Location Confirmation */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-600/30 to-indigo-600/30 border border-blue-500/50">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-blue-300 uppercase tracking-wide">✓ Location Set</p>
                          <p className="text-xs text-slate-100">
                            {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                          </p>
                          <p className="text-[10px] text-blue-200 mt-2">
                            Method: {locationMethod === 'current' ? 'Device Location' : 'Map Pin'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLocationMethod(null)}
                          className="text-xs font-bold text-blue-300 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap"
                        >
                          Change
                        </button>
                      </div>
                    </div>

                    {/* Title */}
                    <div>
                      <h3 className="text-sm font-black text-white mb-3">📋 Step 2: Report Details</h3>
                      <div className="space-y-4 flex-1">
                        {/* Category */}
                        <div>
                          <label className="text-xs font-black text-slate-300 uppercase tracking-wider block mb-2.5">Category</label>
                          <select
                            {...register('category')}
                            className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white font-bold text-sm"
                          >
                            <option value="crime">Crime</option>
                            <option value="traffic">Traffic</option>
                            <option value="infrastructure">Infrastructure</option>
                            <option value="weather">Weather</option>
                            <option value="gas">Gas Prices</option>
                            <option value="emergency">🚨 Emergency</option>
                          </select>
                        </div>

                        {/* Neighborhood */}
                        <div>
                          <label className="text-xs font-black text-slate-300 uppercase tracking-wider block mb-2.5">Neighborhood</label>
                          <select
                            {...register('neighborhood')}
                            className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white font-bold text-sm"
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
                          {errors.neighborhood && <p className="text-red-400 text-xs mt-1.5 font-bold">{errors.neighborhood.message}</p>}
                        </div>

                        {/* Title */}
                        <div>
                          <label className="text-xs font-black text-slate-300 uppercase tracking-wider block mb-2.5">Headline</label>
                          <Input
                            {...register('title')}
                            placeholder="e.g., Major collision on 17th Ave SW"
                            className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 rounded-xl h-11 font-bold px-4 text-sm"
                          />
                          {errors.title && <p className="text-red-400 text-xs mt-1.5 font-bold">{errors.title.message}</p>}
                        </div>

                        {/* Description */}
                        <div>
                          <label className="text-xs font-black text-slate-300 uppercase tracking-wider block mb-2.5">What Happened?</label>
                          <textarea
                            {...register('description')}
                            placeholder="Give neighbors the details they need to know..."
                            rows={3}
                            className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none text-white placeholder:text-slate-600 font-medium text-sm"
                          />
                          {errors.description && <p className="text-red-400 text-xs mt-1.5 font-bold">{errors.description.message}</p>}
                        </div>

                        {/* Anonymous Toggle */}
                        <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 cursor-pointer transition-colors group">
                          <div className="relative inline-flex items-center">
                            <input
                              type="checkbox"
                              {...register('anonymous')}
                              className="h-5 w-5 rounded border-white/20 bg-slate-900 text-blue-500 cursor-pointer accent-blue-500"
                            />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors">Post Anonymously</p>
                            <p className="text-[10px] text-slate-400">Your name won't appear</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Footer with Submit */}
                    <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                      <img
                        src={userProfile?.photoURL || 'https://ui-avatars.com/api/?name=Calgary+User&background=1e293b&color=fff'}
                        alt="Profile"
                        className="w-8 h-8 rounded-lg border border-white/10 object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-200 truncate">
                          {isAnonymous ? 'Anonymous' : userProfile?.displayName?.toUpperCase()}
                        </p>
                      </div>
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 h-11 font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-xl text-sm shadow-lg shadow-blue-500/20 transition-all whitespace-nowrap"
                      >
                        {isSubmitting ? (
                          <div className="flex items-center gap-2">
                            <Loader2 size={16} className="animate-spin" />
                            Posting...
                          </div>
                        ) : (
                          '🚀 Post Report'
                        )}
                      </Button>
                    </div>
                  </motion.form>
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
                
                <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col">
                  {/* STEP 1: Mobile Location Selection */}
                  {!location || !locationMethod ? (
                    <div className="space-y-5 flex-1 flex flex-col">
                      <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Keep Calgary Safe</h2>
                        <p className="text-slate-400 text-xs font-medium mt-1">Report what's happening in real-time</p>
                      </div>

                      <div>
                        <p className="text-xs font-black text-slate-300 uppercase tracking-wider mb-3">📍 Step 1: Select Location</p>
                        <div className="space-y-2.5">
                          {/* Use Current Location */}
                          <button
                            onClick={() => setLocationMethod('current')}
                            className="w-full p-4 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-600/20 to-blue-700/20 active:from-blue-600/40 active:to-blue-700/40 transition-all text-left"
                          >
                            <p className="font-black text-white text-sm mb-1">📌 Use Current Location</p>
                            <p className="text-xs text-slate-300">Uses your device's GPS</p>
                          </button>

                          {/* Pin on Map */}
                          <button
                            onClick={() => setLocationMethod('map')}
                            className="w-full p-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-600/20 to-emerald-700/20 active:from-emerald-600/40 active:to-emerald-700/40 transition-all text-left"
                          >
                            <p className="font-black text-white text-sm mb-1">🗺️ Pin on Map</p>
                            <p className="text-xs text-slate-300">Click the map to select location</p>
                          </button>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 mt-auto">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Tip</p>
                        <p className="text-xs text-slate-300 mt-1.5">Close this drawer and click the map where the incident happened to pin the exact location.</p>
                      </div>
                    </div>
                  ) : (
                    /* STEP 2: Mobile Report Details */
                    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 flex-1 flex flex-col pr-2">
                      <div>
                        <h2 className="text-2xl font-black text-white tracking-tight mb-1">Report Details</h2>
                        <p className="text-slate-400 text-xs font-medium">Location: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</p>
                      </div>

                      {/* Change Location Button */}
                      <button
                        type="button"
                        onClick={() => setLocationMethod(null)}
                        className="text-xs font-bold text-blue-300 hover:text-white bg-blue-600/20 hover:bg-blue-600/30 px-3 py-2 rounded-lg transition-all w-full"
                      >
                        🔄 Change Location
                      </button>

                      <div className="space-y-4 overflow-y-auto no-scrollbar flex-1">
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
                            Headline
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
                            What Happened?
                          </label>
                          <textarea
                            {...register('description')}
                            placeholder="Give neighbors the details they need to know..."
                            rows={3}
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
                            <p className="text-[11px] text-slate-400">Your name won't appear</p>
                          </div>
                        </label>
                      </div>

                      {/* Footer Submit Button */}
                      <div className="pt-3 pb-4 border-t border-white/10">
                        <Button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full h-[44px] text-sm font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-600 disabled:to-slate-700 text-white border-none shadow-lg shadow-blue-500/20 rounded-xl transition-all active:scale-[0.98]"
                        >
                          {isSubmitting ? (
                            <div className="flex items-center justify-center gap-2">
                              <Loader2 className="animate-spin" size={18} />
                              Posting...
                            </div>
                          ) : (
                            '🚀 Post Report'
                          )}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </>
  );
}
