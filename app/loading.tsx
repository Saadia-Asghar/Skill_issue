export default function GlobalLoading() {
  return (
    <div className="mx-auto flex min-h-[40vh] w-full max-w-6xl items-center justify-center px-6 py-16">
      <div
        className="rounded-xl border-2 px-5 py-3 text-xs font-bold uppercase tracking-[0.28em]"
        style={{
          background: "var(--surface)",
          borderColor: "var(--accent-2)",
          color: "var(--accent-2)",
          boxShadow: "0 4px 0 0 #0e5b73",
        }}
      >
        Loading arena...
      </div>
    </div>
  );
}
