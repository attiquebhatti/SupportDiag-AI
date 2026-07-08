import { use } from "react";
import { AIAssistant } from "@/components/ai-assistant";

export default function AIPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">AI Assistant</h2>
      <AIAssistant uploadId={id} />
    </div>
  );
}
