import { ManualReader } from "@/components/manuals/manual-reader";

export default async function AppManualReaderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ManualReader slug={slug} />;
}
