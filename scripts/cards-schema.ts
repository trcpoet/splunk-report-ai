import { writeFileSync } from 'node:fs';
import { cardsJsonSchema } from '@/reports/cards/json-schema';

// npm run cards:schema: writes config/report-cards.schema.json from the cards'
// schema (src/reports/cards/schema.ts). Editors use it to check
// config/report-cards.yaml as you type. A test fails when it's out of date.

writeFileSync('config/report-cards.schema.json', `${JSON.stringify(cardsJsonSchema(), null, 2)}\n`);
console.log('Wrote config/report-cards.schema.json.');
