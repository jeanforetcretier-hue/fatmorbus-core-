/**
 * Validates module.json before a release is published and prepares the
 * release metadata. Fails the workflow on anything Foundry VTT would reject,
 * or on a stale Fatmorbus integrity manifest that would make the published
 * build report itself as modified.
 *
 * Inputs (env):  GITHUB_REPOSITORY, GITHUB_OUTPUT, RELEASE_TAG (optional)
 * Outputs:       id, version, tag, title, zip_name, notes_path
 */
import fs from "node:fs";
import crypto from "node:crypto";

const repository = requireEnv("GITHUB_REPOSITORY");
const tagInput = (process.env.RELEASE_TAG ?? "").trim();
const errors = [];

/* --- module.json ------------------------------------------------------- */
const raw = fs.readFileSync("module.json");
if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
  fail("module.json starts with a UTF-8 BOM. Foundry VTT stops listing the module; save it as UTF-8 without BOM.");
}

let manifest;
try {
  manifest = JSON.parse(raw.toString("utf8"));
} catch (error) {
  fail(`module.json is not valid JSON: ${error.message}`);
}

const id = String(manifest.id ?? "");
const version = String(manifest.version ?? "");
const title = String(manifest.title ?? "");

if (id !== "fatmorbus-core-by-fatmorbus") errors.push(`id must stay "fatmorbus-core-by-fatmorbus" (found "${id}").`);
if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push(`version must be X.Y.Z (found "${version}").`);
if (!title) errors.push("title is missing.");

const zipName = `${id}-v${version}.zip`;
const tag = tagInput || `v${version}`;
if (tag !== `v${version}`) {
  errors.push(`tag ${tag} does not match module.json version ${version}. Bump the version or move the tag.`);
}

/* --- URLs Foundry needs to install and update -------------------------- */
const expectedManifest = `https://raw.githubusercontent.com/${repository}/main/module.json`;
const expectedDownload = `https://github.com/${repository}/releases/download/v${version}/${zipName}`;
if (manifest.manifest !== expectedManifest) {
  errors.push(`manifest must be ${expectedManifest} (found ${manifest.manifest ?? "nothing"}). It has to stay stable across releases.`);
}
if (manifest.download !== expectedDownload) {
  errors.push(`download must be ${expectedDownload} (found ${manifest.download ?? "nothing"}). It has to point at this release's asset.`);
}
if (!manifest.url) errors.push("url is missing.");

/* --- compatibility and declared files ---------------------------------- */
const compatibility = manifest.compatibility ?? {};
if (!compatibility.minimum) errors.push("compatibility.minimum is missing.");
if (!compatibility.verified) errors.push("compatibility.verified is missing.");

for (const key of ["esmodules", "styles", "packs", "languages"]) {
  for (const entry of manifest[key] ?? []) {
    const path = key === "packs" ? entry?.path : key === "languages" ? entry?.path : entry;
    if (!path) continue;
    if (!fs.existsSync(path)) errors.push(`${key} declares "${path}", which is not in the repository.`);
  }
}

/* --- Fatmorbus integrity manifest, when the build ships signed --------- */
const integrityPath = "fatmorbus-integrity.json";
if (fs.existsSync(integrityPath)) {
  let signed;
  try {
    signed = JSON.parse(fs.readFileSync(integrityPath, "utf8"));
  } catch (error) {
    errors.push(`${integrityPath} is not valid JSON: ${error.message}`);
  }
  if (signed) {
    if (String(signed.version) !== version) {
      errors.push(`${integrityPath} signs version ${signed.version}, but module.json is ${version}. Re-sign the build with the Fatmorbus protection kit, or remove the file so Core reports "unsigned" instead of "modified".`);
    }
    if (signed.moduleId !== id) errors.push(`${integrityPath} signs moduleId ${signed.moduleId}, not ${id}.`);
    for (const file of signed.files ?? []) {
      if (!file?.path) continue;
      if (!fs.existsSync(file.path)) {
        errors.push(`${integrityPath} signs "${file.path}", which is missing.`);
        continue;
      }
      const digest = crypto.createHash("sha256").update(fs.readFileSync(file.path)).digest("hex");
      if (digest !== String(file.sha256).toLowerCase()) {
        errors.push(`${integrityPath} is stale: "${file.path}" no longer matches its signed SHA-256. Re-sign the build before releasing.`);
      }
    }
  }
}

if (errors.length) fail(`Release checks failed:\n- ${errors.join("\n- ")}`);

/* --- release notes from the CHANGELOG ---------------------------------- */
const notesPath = "release-notes.md";
fs.writeFileSync(notesPath, releaseNotes(version));

appendOutput({
  id,
  version,
  tag,
  title: `${title} v${version}`,
  zip_name: zipName,
  notes_path: notesPath
});
console.log(`Prepared ${tag} — ${zipName}`);

function releaseNotes(version) {
  if (!fs.existsSync("CHANGELOG.md")) return `Fatmorbus Core ${version}.`;
  const lines = fs.readFileSync("CHANGELOG.md", "utf8").split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === `## ${version}`);
  if (start === -1) return `Fatmorbus Core ${version}.`;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => line.startsWith("## "));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return `${body}\n\n## Installation\n\nFoundry VTT → Add-on Modules → Install Module → Manifest URL:\n\n\`\`\`\n${expectedManifest}\n\`\`\`\n`;
}

function appendOutput(values) {
  const out = requireEnv("GITHUB_OUTPUT");
  const payload = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
  fs.appendFileSync(out, `${payload}\n`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is not set.`);
  return value;
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}
