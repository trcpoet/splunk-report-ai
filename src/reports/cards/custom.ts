import type { CustomRules } from './rules';

// TypeScript rules a card can name with `custom:` in config/report-cards.yaml,
// for what the file's building blocks can't say. Add one here under a name,
// then give that name to the card. A card's own `warn`, `fail` and `highlights`
// win over a custom rule's. Empty until a report needs one.
export const customRules: Record<string, CustomRules> = {};
