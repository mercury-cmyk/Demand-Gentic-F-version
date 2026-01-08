import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/patterns/copy-button";

export interface FieldGroupRow {
  label: string;
  value?: string | null;
  href?: string | null;
  copyValue?: string;
}

export interface FieldGroupProps {
  title: string;
  rows: FieldGroupRow[];
  className?: string;
}

export function FieldGroup({ title, rows, className }: FieldGroupProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="rounded-lg border bg-card divide-y">
        {rows.map((row) => {
          const value = row.value ?? "-";
          const isLink = Boolean(row.href);
          return (
            <div key={row.label} className="flex items-center justify-between gap-4 p-3">
              <div className="text-sm text-muted-foreground">{row.label}</div>
              <div className="flex items-center gap-2 text-sm">
                {isLink ? (
                  <a
                    href={row.href ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {value}
                  </a>
                ) : (
                  <span className="text-foreground">{value}</span>
                )}
                {row.copyValue && <CopyButton value={row.copyValue} size="xs" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
