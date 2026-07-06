import type { ResourceScope } from "@heliograph/otlp";
import type { SourceAdapter } from "./SourceAdapter.ts";
import { DefaultAdapter } from "./DefaultAdapter.ts";

// First adapter whose canHandle(scope) matches wins; unknown sources fall back to
// DefaultAdapter so nothing is silently dropped.
export class AdapterRegistry {
  private readonly adapters: SourceAdapter[] = [];
  private readonly fallback: SourceAdapter;

  constructor(fallback: SourceAdapter = new DefaultAdapter()) {
    this.fallback = fallback;
  }

  register(adapter: SourceAdapter): this {
    this.adapters.push(adapter);
    return this;
  }

  resolve(scope: ResourceScope): SourceAdapter {
    for (const a of this.adapters) {
      if (a.canHandle(scope)) return a;
    }
    return this.fallback;
  }
}
