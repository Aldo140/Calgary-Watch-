import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { gsap } from 'gsap';
import { ShieldCheck, Map as MapIcon, AlertCircle, Radio, Users, ArrowRight, ShieldAlert, Navigation, Layers } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { cn } from '@/src/lib/utils';

export default function LandingPage() {
  const navigate = useNavigate();
  const mapPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mapPreviewRef.current) {
      gsap.to(".pulse-dot", {
        scale: 1.5,
        opacity: 0,
        duration: 2,
        repeat: -1,
        stagger: 0.5,
        ease: "power2.out"
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-blue-500" size={28} />
            <span className="text-xl font-bold tracking-tight">Calgary Watch</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">How it Works</a>
            <a href="/about" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">About</a>
            <Button 
              variant="primary" 
              className="bg-blue-600 hover:bg-blue-700 rounded-full px-6"
              onClick={() => navigate('/map')}
            >
              Open Live Map
            </Button>
          </div>
          <Button 
            variant="secondary" 
            size="icon" 
            className="md:hidden rounded-full"
            onClick={() => navigate('/map')}
          >
            <MapIcon size={20} />
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Live in Calgary</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tight">
              See what's happening in <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Calgary</span> — in real time.
            </h1>
            
            <p className="text-xl text-slate-400 max-w-xl leading-relaxed">
              Live community reports combined with verified police data. Stay informed, stay safe, and contribute to your neighborhood's awareness.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-blue-600 hover:bg-blue-700 rounded-full px-8 h-14 text-lg font-bold group"
                onClick={() => navigate('/map')}
              >
                Open Live Map
                <ArrowRight className="ml-2 transition-transform group-hover:translate-x-1" size={20} />
              </Button>
              <Button 
                variant="secondary" 
                size="lg" 
                className="bg-white/5 border-white/10 hover:bg-white/10 rounded-full px-8 h-14 text-lg font-bold"
                onClick={() => navigate('/map?report=true')}
              >
                Report an Incident
              </Button>
            </div>

            <div className="flex items-center gap-6 pt-4">
              <div className="flex -space-x-3">
                {[1,2,3,4].map(i => (
                  <img 
                    key={i}
                    src={`https://picsum.photos/seed/user${i}/100/100`} 
                    className="w-10 h-10 rounded-full border-2 border-slate-950"
                    alt="User"
                  />
                ))}
              </div>
              <p className="text-sm text-slate-500 font-medium">
                Joined by <span className="text-white font-bold">2,400+</span> Calgarians this week
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative"
          >
            <div className="relative aspect-square max-w-xl mx-auto bg-slate-900 rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden group">
              <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/calgary-map/1000/1000')] bg-cover opacity-40 grayscale group-hover:grayscale-0 transition-all duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
              
              {/* Animated Pins */}
              <div className="absolute top-1/4 left-1/3 pulse-dot w-4 h-4 bg-red-500 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.8)]" />
              <div className="absolute top-1/2 left-2/3 pulse-dot w-4 h-4 bg-orange-500 rounded-full shadow-[0_0_20px_rgba(249,115,22,0.8)]" />
              <div className="absolute bottom-1/3 left-1/4 pulse-dot w-4 h-4 bg-blue-500 rounded-full shadow-[0_0_20px_rgba(59,130,246,0.8)]" />
              
              <div className="absolute bottom-8 left-8 right-8">
                <Card className="bg-slate-950/80 backdrop-blur-xl border-white/10 p-4">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center text-red-400">
                      <AlertCircle size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Road Closure in Beltline</h4>
                      <p className="text-xs text-slate-400">Reported 2 mins ago by Community</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
            
            {/* Floating Stats */}
            <div className="absolute -top-6 -right-6 bg-blue-600 p-6 rounded-3xl shadow-2xl animate-bounce-slow">
              <div className="text-3xl font-black">12</div>
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">Active Alerts</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-32 px-6 bg-slate-900/30">
        <div className="max-w-4xl mx-auto text-center space-y-16">
          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight">Why Calgary Watch?</h2>
            <p className="text-xl text-slate-400">Traditional news and social media aren't built for real-time local awareness.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 text-left">
            {[
              { title: "News is Delayed", desc: "Traditional outlets take hours to report what's happening right now.", icon: Radio },
              { title: "Social Media is Noisy", desc: "Filtering through irrelevant posts to find local safety info is impossible.", icon: Users },
              { title: "No Single Source", desc: "Until now, there was no unified place for real-time community awareness.", icon: ShieldAlert }
            ].map((item, i) => (
              <div key={i} className="space-y-4 p-6 bg-white/5 rounded-3xl border border-white/5">
                <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-blue-400">
                  <item.icon size={24} />
                </div>
                <h3 className="text-xl font-bold">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-32 px-6" id="features">
        <div className="max-w-7xl mx-auto space-y-24">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div className="space-y-8">
              <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">
                The full picture of <br/> urban safety.
              </h2>
              <div className="space-y-6">
                {[
                  { title: "Live Community Map", desc: "See incidents as they are reported by neighbors in real-time.", icon: MapIcon },
                  { title: "Area Intelligence", desc: "Get historical context and safety scores for every neighborhood.", icon: Layers },
                  { title: "Verified Data", desc: "We integrate official Calgary Police data for verified context.", icon: ShieldCheck }
                ].map((item, i) => (
                  <div key={i} className="flex gap-6 group">
                    <div className="w-14 h-14 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <item.icon size={28} />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold">{item.title}</h4>
                      <p className="text-slate-400 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded-[3rem] p-8 border border-white/10">
              <img 
                src="https://picsum.photos/seed/app-preview/1200/800" 
                className="rounded-2xl shadow-2xl border border-white/10" 
                alt="App Preview"
              />
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-32 px-6 bg-slate-900/30" id="how-it-works">
        <div className="max-w-7xl mx-auto text-center space-y-16">
          <h2 className="text-4xl md:text-5xl font-black tracking-tight">How it Works</h2>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              { step: "01", title: "Spot & Report", desc: "See something? Report it instantly with a category and location." },
              { step: "02", title: "Live Update", desc: "Your report appears on the map for all neighbors to see instantly." },
              { step: "03", title: "Context Added", desc: "Our system adds historical data and safety scores to the report." }
            ].map((item, i) => (
              <div key={i} className="relative space-y-4">
                <div className="text-8xl font-black text-white/5 absolute -top-12 left-1/2 -translate-x-1/2">{item.step}</div>
                <h3 className="text-2xl font-bold relative z-10">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed relative z-10 max-w-xs mx-auto">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Trust */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[3rem] p-12 text-center space-y-8 shadow-2xl">
          <ShieldCheck size={64} className="mx-auto text-white/80" />
          <h2 className="text-4xl font-black tracking-tight">Data You Can Trust</h2>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto leading-relaxed">
            We bridge the gap between community reports and official data. Calgary Watch integrates Calgary Police Service (CPS) data to provide a verified layer of urban awareness.
          </p>
          <div className="flex justify-center gap-8 pt-4">
            <div className="text-center">
              <div className="text-2xl font-black">Verified</div>
              <div className="text-[10px] uppercase font-bold opacity-70 tracking-widest">Official Sources</div>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div className="text-center">
              <div className="text-2xl font-black">Real-Time</div>
              <div className="text-[10px] uppercase font-bold opacity-70 tracking-widest">Community Driven</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6 text-center space-y-12">
        <h2 className="text-5xl md:text-7xl font-black tracking-tight max-w-4xl mx-auto">
          Join Calgary's real-time awareness network.
        </h2>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Button 
            size="lg" 
            className="bg-blue-600 hover:bg-blue-700 rounded-full px-12 h-16 text-xl font-bold"
            onClick={() => navigate('/map')}
          >
            Open Live Map
          </Button>
          <Button 
            variant="secondary" 
            size="lg" 
            className="bg-white/5 border-white/10 hover:bg-white/10 rounded-full px-12 h-16 text-xl font-bold"
            onClick={() => navigate('/map?report=true')}
          >
            Submit Report
          </Button>
        </div>
      </section>

      {/* City Expansion */}
      <section className="py-20 px-6 border-t border-white/5">
        <div className="max-w-xl mx-auto text-center space-y-6">
          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Want this in your city?</h4>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Enter your city name" 
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button className="bg-white text-slate-950 hover:bg-slate-200 rounded-xl px-6 font-bold">Request</Button>
          </div>
          <p className="text-[10px] text-slate-600">Currently in demand for: Edmonton (420), Vancouver (310), Toronto (280)</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5 bg-slate-950">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-blue-500" size={24} />
            <span className="text-lg font-bold tracking-tight">Calgary Watch</span>
          </div>
          <div className="flex gap-8 text-sm text-slate-500">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
          <p className="text-xs text-slate-600">
            © 2026 Calgary Watch. Community Safety Platform.
          </p>
        </div>
        <div className="max-w-7xl mx-auto mt-8 p-4 bg-red-500/5 border border-red-500/10 rounded-2xl text-center">
          <p className="text-[10px] text-red-400/80 uppercase font-bold tracking-widest">
            Disclaimer: User-generated content. Always verify with official sources before taking action.
          </p>
        </div>
      </footer>
    </div>
  );
}
