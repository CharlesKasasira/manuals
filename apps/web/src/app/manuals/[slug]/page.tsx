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
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ReaderLayout manual={manual!} />
      </main>
    </>
  );
}
