interface BadgeProps {
  tone?: "good" | "warn" | "danger" | "neutral";
  children: string;
}

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
