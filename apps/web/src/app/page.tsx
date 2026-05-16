import { ManualBrowser } from "@/components/manuals/manual-browser";
import { Topbar } from "@/components/layout/topbar";
import { publicApi } from "@/lib/api";
import { Manual } from "@/lib/types";

async function getManuals() {
  try {
    const response = await publicApi<{ data: Manual[] }>("/public/manuals");
    return response.data;
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const manuals = await getManuals();
  return (
    <>
      <Topbar />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ManualBrowser manuals={manuals} />
      </main>
    </>
  );
}
