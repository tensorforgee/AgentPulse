import { statusStyles } from "@/lib/telemetry-format";
import type { TelemetryStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: TelemetryStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles(status)}`}
    >
      {status}
    </span>
  );
}
