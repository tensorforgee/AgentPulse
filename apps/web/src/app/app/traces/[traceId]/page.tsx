import { TraceDetail } from "@/components/trace-detail";

export default async function TraceDetailPage({
  params,
}: PageProps<"/app/traces/[traceId]">) {
  const { traceId } = await params;
  return <TraceDetail traceId={traceId} />;
}
