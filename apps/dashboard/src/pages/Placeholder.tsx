// Route stub for pages whose phase hasn't landed yet (see UI-PLAN.md).
import { PageHeader, EmptyPage } from "../ui/index.ts";

export function Placeholder({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyPage
        title={phase > 0 ? `Coming in Phase ${phase}` : "Page not found"}
        note={phase > 0 ? "This drill-down is on the roadmap — see UI-PLAN.md." : undefined}
      />
    </>
  );
}
