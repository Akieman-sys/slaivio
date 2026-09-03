import Image from "next/image";

export function SlaivioBrand({ compact = false, inverse = false, iconOnly = false, rail = false }: { compact?: boolean; inverse?: boolean; iconOnly?: boolean; rail?: boolean }) {
  const iconSize = rail ? 42 : compact ? 30 : 38;
  return (
    <span className="inline-flex min-w-0 items-center gap-1" aria-label="Slaivio">
      <Image
        src="/slaivio-icon-official.png"
        alt=""
        width={iconSize}
        height={iconSize}
        priority
        className={`${rail ? "h-[42px] w-[42px]" : compact ? "h-[30px] w-[30px]" : "h-[38px] w-[38px]"} shrink-0 object-contain`}
      />
      {!iconOnly && <span className={`${compact ? "text-[20px]" : "text-[27px]"} truncate font-semibold ${inverse ? "text-white" : "text-[#202428]"}`}>Slaivio</span>}
    </span>
  );
}
