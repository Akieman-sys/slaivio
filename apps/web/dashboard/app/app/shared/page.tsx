import Link from "next/link";

export default function SharedPage() {
  return (
    <div className="min-h-full bg-[#f8f8f7] px-12 py-9">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#202124]">Shared</h1>
      <div className="mt-[280px] text-center">
        <h2 className="text-[22px] text-[#202124]">Nothing shared with you yet</h2>
        <p className="mt-2 text-[13px] text-[#6b7075]">
          Shared workspaces, bases, and modules will appear here.
        </p>
        <Link
          href="/app"
          className="mt-7 inline-flex h-9 items-center rounded-[5px] border border-[#d3d3d0] bg-white px-4 text-[13px] shadow-sm"
        >
          Go to all workspaces
        </Link>
      </div>
    </div>
  );
}
