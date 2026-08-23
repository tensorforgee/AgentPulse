export default function LoadingTrace() {
  return (
    <div
      className="mx-auto max-w-7xl animate-pulse"
      role="status"
      aria-label="Loading trace"
    >
      <span className="sr-only">Loading trace…</span>
      <div className="h-5 w-28 rounded bg-slate-200" />
      <div className="mt-6 h-10 w-2/5 rounded bg-slate-200" />
      <div className="mt-8 h-28 rounded-2xl bg-slate-200" />
      <div className="mt-6 h-80 rounded-2xl bg-slate-200" />
    </div>
  );
}
