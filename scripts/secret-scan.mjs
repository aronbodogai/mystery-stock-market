// Local secret scan for `npm run check` (CI runs trufflehog on its own).
// Runs trufflehog over the source if it is installed; otherwise warns and does not fail.
import { spawnSync } from "node:child_process";

const probe = spawnSync("trufflehog", ["--version"], { stdio: "ignore", shell: true });
if (probe.status !== 0) {
  console.warn("secret scan skipped: trufflehog is not installed (https://github.com/trufflesecurity/trufflehog/releases)");
  process.exit(0);
}
const scan = spawnSync(
  "trufflehog",
  ["filesystem", "src", "test", "scripts", "public/explainer/manifest.json", "--results=verified,unverified", "--fail", "--no-update"],
  { stdio: "inherit", shell: true },
);
process.exit(scan.status ?? 1);
