export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-base-surface ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ rows = 2 }: { rows?: number }) {
  return (
    <div className="bg-base-card border border-base-border rounded-2xl p-4 space-y-3" aria-hidden="true">
      <Skeleton className="h-4 w-2/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i % 2 === 0 ? 'w-full' : 'w-4/5'}`} />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Carregando...">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} rows={i % 2 === 0 ? 2 : 1} />
      ))}
    </div>
  );
}
