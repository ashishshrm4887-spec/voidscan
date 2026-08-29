import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { copyText } from "@/lib/utils";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);

  async function onCopy() {
    try {
      await copyText(value);
      setDone(true);
      toast.success("Copied");
      window.setTimeout(() => setDone(false), 1200);
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={onCopy} aria-label={label}>
      {done ? <Check /> : <Copy />}
      {label}
    </Button>
  );
}
