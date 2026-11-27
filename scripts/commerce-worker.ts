import { work } from '../lib/commerce.ts';

work().catch(() => {
  console.error('Commerce worker failed.');
  process.exitCode = 1;
});
