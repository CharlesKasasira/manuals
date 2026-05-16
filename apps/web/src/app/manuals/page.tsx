import { Topbar } from "@/components/layout/topbar";
import { ManualBrowser } from "@/components/manuals/manual-browser";
import { publicApi } from "@/lib/api";
import { Manual } from "@/lib/types";

export default async function ManualsPage() {
  let manuals: Manual[] = [];
  try {
    manuals = (await publicApi<{ data: Manual[] }>("/public/manuals")).data;
  } catch {}

  return (
    <>
      <Topbar />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ManualBrowser manuals={manuals} />
      </main>
    </>
  );
}
