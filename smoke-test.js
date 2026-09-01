const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
const referencedIds = [...app.matchAll(/\$\("#([A-Za-z][\w-]*)"\)/g)].map((match) => match[1]);
const missing = [...new Set(referencedIds)].filter((id) => !ids.includes(id));
const dialogTargets = [...html.matchAll(/data-close-dialog="([^"]+)"/g)].map((match) => match[1]).filter((id) => !ids.includes(id));

JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));

if (duplicates.length || missing.length || dialogTargets.length) {
  console.error({ duplicateIds: duplicates, missingScriptTargets: missing, missingDialogTargets: dialogTargets });
  process.exit(1);
}

console.log(`静态检查通过：${ids.length} 个界面节点，${new Set(referencedIds).size} 个脚本引用。`);
