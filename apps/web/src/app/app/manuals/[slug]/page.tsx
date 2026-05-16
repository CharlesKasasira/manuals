import { ManualEditor } from "@/components/manuals/manual-editor";

export default async function AppManualEditorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ManualEditor slug={slug} />;
}
