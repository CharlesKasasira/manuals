import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DraftsPage() {
  return (
    <Card>
      <CardHeader><div className="flex items-center gap-2 font-semibold"><FileText size={17} />Drafts</div></CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600">Draft manuals and pages are separate from published content. This queue is backed by `/manuals?status=draft`.</p>
      </CardContent>
    </Card>
  );
}
