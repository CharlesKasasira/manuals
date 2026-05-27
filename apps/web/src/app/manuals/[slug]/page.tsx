import { notFound } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import { ReaderLayout } from "@/components/manuals/reader-layout";
import { publicApi } from "@/lib/api";
import { Manual } from "@/lib/types";

export default async function PublicManualPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let manual: Manual | null = null;
  try {
    manual = (await publicApi<{ data: Manual }>(`/public/manuals/${slug}`)).data;
  } catch {
    notFound();
  }

  return (
    <>
      <Topbar />
      <main>
        <section className="border-b border-line bg-white px-4 py-8">
          <div className="mx-auto max-w-7xl">
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">{manual!.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{manual!.description}</p>
          </div>
        </section>
        <div className="mx-auto max-w-7xl px-4 py-6">
          <ReaderLayout manual={manual!} />
        </div>
      </main>
    </>
  );
}
