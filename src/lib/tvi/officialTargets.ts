// The curated list of official pages the TVI ingestion may read (phase B). Owner-curated: a page is added here only after a person has checked it is the official source and that it
// publishes the facts as structured data. EMPTY on purpose: a probe of five official Vietnamese attraction sites (20/11/2026) found no schema.org attraction data on any of them, so a
// list built blind would write nothing. See docs/handoff/HANDOFF-20261120-web-viec-con-lai.md section 4e.

import type { OfficialTarget } from './ingestOfficial'

export const OFFICIAL_TARGETS: readonly OfficialTarget[] = []
