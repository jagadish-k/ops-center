const Logo = () => (
  <div className="flex flex-1 items-center gap-4">
    <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-900/40 to-blue-900/40 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
      <div className="absolute inset-0 rounded-lg bg-cyan-400 blur-md opacity-20"></div>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-cyan-400 relative z-10"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    </div>
    <div className="flex items-center">
      <span
        className="font-mono text-lg font-black tracking-widest uppercase text-transparent"
        style={{ WebkitTextStroke: '1px #22d3ee' }}
      >
        Ops
      </span>
      <span className="font-mono text-lg font-black tracking-[0.2em] uppercase text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
        Center
      </span>
    </div>
  </div>
);

export default Logo;
