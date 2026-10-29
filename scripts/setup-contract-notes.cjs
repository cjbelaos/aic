/* eslint-disable @typescript-eslint/no-require-imports */
const load = require("./proforma-runtime.cjs").createLoader();
async function main() {
  const { setupContractNotes, getContractNotes } = load("src/lib/contractNoteSheets.ts");
  const apply = process.argv.includes("--apply");
  const report = await setupContractNotes(apply);
  if (apply) {
    const remaining = await setupContractNotes(false);
    if (remaining.createSheet || remaining.legacyCount) throw new Error("Contract notes migration readback failed.");
    report.noteCount = (await getContractNotes()).length;
    report.verified = true;
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
