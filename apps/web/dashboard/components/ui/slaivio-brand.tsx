import Image from "next/image";

export function SlaivioBrand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1" aria-label="Slaivio">
      <Image
        src="/slaivio-icon-official.png"
        alt=""
        width={compact ? 30 : 38}
        height={compact ? 30 : 38}
        priority
        className={`${compact ? "h-[30px] w-[30px]" : "h-[38px] w-[38px]"} shrink-0 object-contain`}
      />
      <span className={`${compact ? "slaivio-brand-cycle text-[20px]" : "text-[27px]"} truncate font-semibold ${inverse ? "text-white" : "text-[#202428]"}`}>
        Slaivio
      </span>
    </span>
  );
}
