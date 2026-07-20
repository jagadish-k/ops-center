import { Button } from '@heroui/react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/context/AuthContext';

export default function Docs() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-500/30">
      {/* Navbar */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <h1 className="font-mono text-sm font-black uppercase tracking-widest text-white">
            StadOps Manual
          </h1>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="bg-white/5 font-mono font-bold uppercase tracking-widest text-white hover:bg-white/10"
          onPress={signOut}
        >
          Sign Out
        </Button>
      </header>

      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-32 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.15),transparent_50%)]" />
        <h2 className="relative z-10 max-w-3xl text-5xl font-black tracking-tight text-white md:text-7xl">
          The Living Document
        </h2>
        <p className="relative z-10 mt-6 max-w-2xl text-lg font-medium leading-relaxed text-slate-400 md:text-xl">
          A definitive guide to the capabilities of the StadOps platform.
          Discover how we connect the control room to the field in real-time.
        </p>
      </section>

      {/* Feature 1: Control Room */}
      <section className="px-6 py-24 border-t border-white/5">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-2xl">
            <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-blue-400">
              01 / Command & Control
            </h3>
            <h4 className="mt-4 text-3xl font-bold tracking-tight text-white md:text-5xl">
              The Operations Dashboard
            </h4>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed">
              Achieve total situational awareness. The control room features a
              live radar map, a real-time incident queue, and multi-tenant
              capabilities, allowing operators to monitor and respond to events
              across any venue instantly.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10 shadow-2xl">
            <img
              src="/images/control_room.png"
              alt="Control Room Dashboard Mockup"
              className="w-full h-auto object-cover opacity-90 transition-opacity hover:opacity-100"
            />
          </div>
        </div>
      </section>

      {/* Feature 2: Field Agent */}
      <section className="px-6 py-24 bg-slate-900/30 border-t border-white/5">
        <div className="mx-auto max-w-7xl grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
          <div className="order-2 lg:order-1 overflow-hidden rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10 shadow-2xl">
            <img
              src="/images/field_agent.png"
              alt="Field Agent Mobile Interface Mockup"
              className="w-full h-auto object-cover opacity-90 transition-opacity hover:opacity-100"
            />
          </div>
          <div className="order-1 lg:order-2">
            <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-emerald-400">
              02 / On The Ground
            </h3>
            <h4 className="mt-4 text-3xl font-bold tracking-tight text-white md:text-5xl">
              Field Agent Link
            </h4>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed">
              Equip your staff with a clean, low-friction mobile interface.
              Features push-to-talk voice ingest for instant reporting, manual
              triage with offline queueing, and smart floor-syncing to ensure
              context is never lost.
            </p>
          </div>
        </div>
      </section>

      {/* Feature 3: Smart Dispatch */}
      <section className="px-6 py-24 border-t border-white/5">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-2xl">
            <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-amber-400">
              03 / Closed Loop
            </h3>
            <h4 className="mt-4 text-3xl font-bold tracking-tight text-white md:text-5xl">
              Smart Dispatching
            </h4>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed">
              Close the loop between command and the field. Dispatch assignments
              directly from the control room instantly alert on the field
              staff's mobile device, complete with automatic floor tracking and
              tracking status updates.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 ring-1 ring-white/10 shadow-2xl">
            <img
              src="/images/dispatch.png"
              alt="Smart Dispatch Split Screen Mockup"
              className="w-full h-auto object-cover opacity-90 transition-opacity hover:opacity-100"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-950 py-12 text-center">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-slate-600">
          StadOps — {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
