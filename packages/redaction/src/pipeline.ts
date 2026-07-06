// Redaction pipeline: runs the stage chain, then guarantees no staged raw
// content survives. Default posture is metadata-only. See docs/ARCHITECTURE.md.
import type { CanonicalEvent, OrgPolicy } from "@heliograph/domain";
import { DEFAULT_STAGES } from "./stages.ts";
import type { Redactor, RedactionDeps } from "./types.ts";
import { createEnvelopeEncryptor, loadMasterKey } from "./encrypt.ts";

export class RedactionPipeline {
  constructor(
    private readonly stages: Redactor[],
    private readonly deps: RedactionDeps,
  ) {}

  redactEvent(event: CanonicalEvent, policy: OrgPolicy): CanonicalEvent {
    for (const stage of this.stages) stage.apply(event, policy, this.deps);
    // Safety net: raw staged content must never reach the queue/storage.
    delete event.stagedContent;
    if (event.redactionFlags?.length === 0) delete event.redactionFlags;
    return event;
  }
}

/** Default pipeline: full stage chain + envelope encryptor from a master key. */
export function createRedactionPipeline(masterKeyBase64?: string): RedactionPipeline {
  const encrypt = createEnvelopeEncryptor(loadMasterKey(masterKeyBase64));
  return new RedactionPipeline(DEFAULT_STAGES, { encrypt });
}
