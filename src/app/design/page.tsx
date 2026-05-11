import { Suspense } from "react";
import DesignStudio from "@/components/DesignStudio";

export default function DesignPage() {
  return (
    <Suspense fallback={<DesignStudioFallback />}>
      <DesignStudio />
    </Suspense>
  );
}

function DesignStudioFallback() {
  return (
    <div className="grid h-64 place-items-center text-sm text-[var(--muted)]">
      Loading studio…
    </div>
  );
}
