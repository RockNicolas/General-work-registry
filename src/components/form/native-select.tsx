import { cn } from "@/lib/utils";

/**
 * <select> nativo com a aparência dos campos do sistema. Usado em filtros por GET, que funcionam
 * sem JavaScript e deixam a URL compartilhável.
 */
export function NativeSelect({
  name,
  label,
  defaultValue,
  options,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className={cn(
          "h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
          className,
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-background text-foreground">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
