import { cn } from "@email-relay/ui/lib/utils";

/** Two-letter provider marks, colored per provider so rows scan quickly. */
const GLYPHS: Record<string, { short: string; className: string }> = {
  gmail: { short: "G", className: "bg-destructive-muted text-destructive" },
  outlook: { short: "O", className: "bg-brand-muted text-brand" },
  imap: { short: "I", className: "bg-muted text-muted-foreground" },
};

export default function ProviderGlyph({
  provider,
  className,
}: {
  provider?: string | null;
  className?: string;
}) {
  const key = (provider ?? "").toLowerCase();
  const glyph = GLYPHS[key] ?? { short: "?", className: "bg-muted text-muted-foreground" };

  return (
    <span
      /* Decorative: the provider is already stated in adjacent text, so this is
         hidden from assistive tech rather than repeating it. */
      aria-hidden="true"
      title={provider ?? undefined}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-sm text-[0.5625rem] font-semibold",
        glyph.className,
        className,
      )}
    >
      {glyph.short}
    </span>
  );
}
