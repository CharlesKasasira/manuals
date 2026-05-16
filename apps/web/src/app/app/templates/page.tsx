import { BookTemplate } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function TemplatesPage() {
  return (
    <Card>
      <CardHeader><div className="flex items-center gap-2 font-semibold"><BookTemplate size={17} />Templates</div></CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600">Manual templates are reserved for the next iteration. The MVP schema leaves room for template-backed page creation.</p>
      </CardContent>
    </Card>
  );
}
