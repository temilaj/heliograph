// Upserts person_directory rows from a JSON file. Stand-in for a SCIM sync.
//   bun run directory:load [file.json]   (default: tools/directory-loader/sample-directory.json)
// Hashes account_uuid with IDENTITY_PEPPER — MUST match ingest's pepper or the
// rows never join hg_metrics.user_hash.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeStorageProvider, type DirectoryRecord } from "@heliograph/storage";
import { createIdentityHasher } from "@heliograph/enrichment";
import { clickhouseEnv, identityPepper, storeProviderName } from "@heliograph/config";

interface DirectoryFile {
  org: string;
  people: Array<{
    accountUuid: string;
    displayName: string;
    email: string;
    externalId?: string;
    personId?: string;
  }>;
}

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(process.argv[2] ?? join(here, "..", "sample-directory.json"));

const parsed = (await Bun.file(file).json()) as DirectoryFile;
if (!parsed.org || !Array.isArray(parsed.people)) {
  throw new Error(`invalid directory file: expected { org, people[] } in ${file}`);
}

// Fail fast on junk rows: a missing account_uuid would hash to a key that joins
// nothing; a missing name defeats the point of the directory.
parsed.people.forEach((p, i) => {
  if (!p.accountUuid || !p.displayName) {
    throw new Error(`person[${i}] is missing required accountUuid or displayName`);
  }
});

const hash = createIdentityHasher(identityPepper());
const records: DirectoryRecord[] = parsed.people.map((p) => ({
  orgId: parsed.org,
  accountHash: hash(p.accountUuid),
  personId: p.personId,
  displayName: p.displayName,
  email: p.email,
  externalId: p.externalId,
}));

const storage = makeStorageProvider({ provider: storeProviderName(), clickhouse: clickhouseEnv() });
await storage.migrate();
await storage.personDirectory().upsert(records);
await storage.close();

process.stdout.write(`loaded ${records.length} people for ${parsed.org} from ${file}\n`);
