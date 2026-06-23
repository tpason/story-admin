type LoadingBlockProps = {
  label?: string;
  variant?: "inline" | "stats" | "table";
  rows?: number;
};

export function LoadingBlock({ label = "Đang tải...", variant = "inline", rows = 5 }: LoadingBlockProps) {
  if (variant === "stats") {
    return (
      <div className="skeleton-grid stats-grid" aria-busy="true" aria-label={label}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-stat" />
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="skeleton-grid" aria-busy="true" aria-label={label}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton skeleton-row" />
        ))}
      </div>
    );
  }

  return (
    <div className="loading-block" aria-busy="true">
      {label}
    </div>
  );
}
