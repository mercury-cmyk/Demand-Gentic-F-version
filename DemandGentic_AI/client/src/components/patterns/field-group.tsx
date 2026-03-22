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
    
      
        {title}
      
      
        {rows.map((row) => {
          const value = row.value ?? "-";
          const isLink = Boolean(row.href);
          return (
            
              {row.label}
              
                {isLink ? (
                  
                    {value}
                  
                ) : (
                  {value}
                )}
                {row.copyValue && }
              
            
          );
        })}
      
    
  );
}