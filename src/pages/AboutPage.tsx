import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, ShieldAlert, Users, Database, Radio, Map as MapIcon, Zap } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { cn } from '@/src/lib/utils';

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-blue-500" size={28} />
            <span className="text-xl font-bold tracking-tight">Calgary Watch</span>
          </div>
          <Button 
            variant="secondary" 
            className="rounded-full px-6 bg-white/5 border-white/10 hover:bg-white/10"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="mr-2" size={18} />
            Back to Home
          </Button>
        </div>
      </nav>

      <main className="pt-40 pb-20 px-6 max-w-4xl mx-auto space-y-20">
        <div className="space-y-6 text-center">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight">About Calgary Watch</h1>
          <p className="text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Our mission is to empower Calgarians with real-time urban awareness through community-driven data and verified official sources.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">The Vision</h2>
            <p className="text-slate-400 leading-relaxed">
              Calgary Watch was born from a simple observation: when something happens in our city, we often find out too late. Whether it's a major road closure, a localized weather event, or a safety concern, the information is scattered across social media or delayed on traditional news.
            </p>
            <p className="text-slate-400 leading-relaxed">
              We believe that by combining the eyes and ears of the community with the verification of official data, we can create a safer, more connected Calgary.
            </p>
          </div>
          <div className="bg-white/5 rounded-[2rem] p-8 border border-white/10 flex items-center justify-center">
            <ShieldCheck size={120} className="text-blue-500/20" />
          </div>
        </div>

        <div className="space-y-12">
          <h2 className="text-3xl font-black tracking-tighter text-center uppercase">Our Core Pillars</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: "Community Driven", desc: "Reports come directly from people on the ground, providing the fastest possible updates.", icon: Users, color: "text-blue-400", bg: "bg-blue-400/10" },
              { title: "Data Integrity", desc: "We integrate official CPS data to provide a verified context for community reports.", icon: Database, color: "text-purple-400", bg: "bg-purple-400/10" },
              { title: "Real-Time Focus", desc: "Our platform is built for the 'now', prioritizing what's happening right this second.", icon: Zap, color: "text-green-400", bg: "bg-green-400/10" }
            ].map((pillar, i) => (
              <div key={i} className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 space-y-6 hover:bg-white/[0.08] transition-all group">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform", pillar.bg, pillar.color)}>
                  <pillar.icon size={32} />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight">{pillar.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed font-medium">{pillar.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-12 bg-gradient-to-br from-slate-900 to-slate-950 rounded-[3rem] border border-white/10 space-y-10">
          <div className="space-y-4">
            <h2 className="text-3xl font-black tracking-tighter uppercase">Safety & Verification</h2>
            <p className="text-slate-400 leading-relaxed font-medium max-w-2xl">
              Trust is our most important asset. We clearly distinguish between community-reported incidents and verified data using a multi-layered verification system.
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="flex gap-5 p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:border-white/10 transition-all">
              <div className="w-12 h-12 bg-yellow-500/10 rounded-xl flex items-center justify-center shrink-0">
                <ShieldAlert className="text-yellow-500" size={28} />
              </div>
              <div>
                <h4 className="font-black uppercase tracking-tight mb-1">Unverified Reports</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">Initial reports from community members. These are flagged for verification and should be used as general awareness.</p>
              </div>
            </div>
            <div className="flex gap-5 p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:border-white/10 transition-all">
              <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center shrink-0">
                <ShieldCheck className="text-green-500" size={28} />
              </div>
              <div>
                <h4 className="font-black uppercase tracking-tight mb-1">Verified Data</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">Confirmed by multiple independent reports or official Calgary Police data feeds. High confidence level.</p>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/5">
            <h3 className="text-xl font-black uppercase tracking-tighter mb-6">Our Data Sources</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="text-blue-400 font-black uppercase tracking-widest text-[10px]">Official Feeds</h4>
                <ul className="space-y-3 text-slate-300 font-medium text-sm">
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Calgary Police Service (CPS) API
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    City of Calgary Open Data Portal
                  </li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="text-purple-400 font-black uppercase tracking-widest text-[10px]">Community Layers</h4>
                <ul className="space-y-3 text-slate-300 font-medium text-sm">
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    Real-time user reporting
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    Multi-report cross-referencing
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center space-y-8">
          <h2 className="text-3xl font-bold tracking-tight">Ready to see your city?</h2>
          <Button 
            size="lg" 
            className="bg-blue-600 hover:bg-blue-700 rounded-full px-12 h-16 text-xl font-bold"
            onClick={() => navigate('/map')}
          >
            Open Live Map
          </Button>
        </div>
      </main>

      <footer className="py-12 px-6 border-t border-white/5 bg-slate-950 text-center">
        <p className="text-xs text-slate-600 uppercase font-bold tracking-widest">
          Calgary Watch • Community Safety Platform • © 2026
        </p>
      </footer>
    </div>
  );
}
