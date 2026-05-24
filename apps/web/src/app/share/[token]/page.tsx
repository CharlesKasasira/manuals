import { notFound } from "next/navigation";
import { ReaderLayout } from "@/components/manuals/reader-layout";
import { publicApi, API_URL } from "@/lib/api";
import { Manual } from "@/lib/types";

export default async function SharedManualPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let manual: Manual | null = null;
  try {
    manual = (await publicApi<{ data: Manual }>(`/public/share/${token}`)).data;
  } catch {
    notFound();
  }

  return (
    <main>
      <section className="border-b border-line bg-slate-950 px-4 py-8 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">Private manual share</p>
            <h1 className="mt-2 text-3xl font-semibold">{manual!.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{manual!.description}</p>
          </div>
          <a href={`${API_URL}/public/share/${token}/offline-pack`} className="inline-flex h-10 items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-slate-100">
            Download offline pack
          </a>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <ReaderLayout manual={manual!} />
      </div>
    </main>
  );
}
