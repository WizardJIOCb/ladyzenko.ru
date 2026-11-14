import { setupAdmin } from '../lib/admin.ts';
async function main() {
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 2048) throw new Error('Input too large'); }
  const data = JSON.parse(input);
  setupAdmin(data.password);
  process.stdout.write('Admin password configured. Existing sessions revoked.\n');
}
main().catch(() => { process.stderr.write('Admin setup failed. Check input and private state directory.\n'); process.exitCode = 1; });
