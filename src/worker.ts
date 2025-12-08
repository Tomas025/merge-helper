import { execa } from "execa";
import tmp from "tmp-promise";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { parse, html as diffHtml } from "diff2html";

type Meta = {
  owner: string;
  repo: string;
  prNumber: number;
  headRef: string;
  baseRef: string;
  headSha: string;
  resolvedCommit: string;
  createdAt: string;
};

const tmpObj = await tmp.dir({ unsafeCleanup: true }); // diretório temporario para workspaces
const BASE_TMP = tmpObj.path; // pegando a rota do diretorio, exemplo: /Temp/tmp-XXXX
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const BASE_ENV = { GIT_TERMINAL_PROMPT: "0", ...process.env };

function wsPath(owner: string, repo: string, pr: number, headSha: string) {
  const sha7 = headSha.slice(0, 7);
  return path.join(BASE_TMP, "work", owner, repo, String(pr), sha7);
} // nomes únicos por PR+SHA


function withOpts(cwd?: string) {
  return {
    cwd,
    env: BASE_ENV,
    timeout: DEFAULT_TIMEOUT_MS
  } as const;
}

function authedCloneUrl(cloneUrl: string, token: string) {
  // cloneUrl vem como https://github.com/owner/repo.git
  return cloneUrl.replace("https://", `https://x-access-token:${token}@`);
}

export async function runS3MMergeForPR(args: {
  owner: string; repo: string; prNumber: number; headRef: string; baseRef: string;
  headSha: string; cloneUrl: string; token: string;
}) {
  const ws = wsPath(args.owner, args.repo, args.prNumber, args.headSha);
  const srcDir = path.join(ws, "src");
  const infoAttrs = path.join(srcDir, ".git", "info", "attributes");
  const jarPath = path.resolve(process.cwd(), "s3m.jar");
  await fs.emptyDir(srcDir); // limpa/garante diretório

  console.log(srcDir);

  const remote = authedCloneUrl(args.cloneUrl, args.token);
  await execa("git", ["clone", "--no-tags", remote, srcDir], withOpts()); // sem tags para performance
  await execa("git", ["config", "user.name", "Merge-Helper"], withOpts(srcDir));
  await execa("git", ["config", "user.email", "bot@example.com"], withOpts(srcDir));
  await execa("git", ["config", "merge.s3m.name", "semi_structured_3_way_merge_tool_for_java"], withOpts(srcDir));
  await execa(
    "git",
    ["config", "merge.s3m.driver", `java -jar "${jarPath}" %A %O %B -o %A -g`],
    withOpts(srcDir)
  );
  await fs.ensureFile(infoAttrs);
  const attrsContent = (await fs.readFile(infoAttrs, "utf-8").catch(() => "")) || "";
  if (!attrsContent.includes("*.java merge=s3m")) {
    await fs.appendFile(infoAttrs, "\n*.java merge=s3m\n", "utf-8");
  }

  await execa("git", ["fetch", "--all", "--prune"], withOpts(srcDir)); // sincroniza/prune
  await execa("git", ["checkout", args.baseRef], withOpts(srcDir));

  const workBranch = `merge-helper/s3m/${args.prNumber}-${args.headSha.slice(0, 7)}`;
  await execa("git", ["checkout", "-B", workBranch], withOpts(srcDir));

  try {
    await execa("git", ["merge", "--no-ff", "--no-commit", `origin/${args.headRef}`], withOpts(srcDir));
  } catch (e: any) {
    await execa("git", ["merge", "--abort"], withOpts(srcDir)).catch(() => {});
    return { status: "no-fix" as const, reason: e.stderr || e.message };
  }

  await execa("git", ["add", "-A"], withOpts(srcDir));
  await execa("git", ["commit", "-m", "Merge Helper: Conflitos resolvidos automaticamente"], withOpts(srcDir));

  // captura o commit resolvido
  const { stdout: resolvedCommit } = await execa("git", ["rev-parse", "HEAD"], withOpts(srcDir));

  // gera diff
  const { stdout: patch } = await execa("git", ["diff", `origin/${args.baseRef}...`], withOpts(srcDir));
  const diffHtmlStr = diffHtml(parse(patch), { drawFileList: true, matching: "lines" });

  // salva diff
  const key = `${args.owner}/${args.repo}#${args.prNumber}-${args.headSha}`;
  const storeDir = path.join(os.tmpdir(), "s3m-merge-helper-diffs");
  const safeKey = key.replace(/[^a-zA-Z0-9._\-]/g, "_");
  const file = path.join(storeDir, `${safeKey}.html`);
  await fs.ensureDir(path.dirname(file));
  await fs.writeFile(file, diffHtmlStr, "utf-8");

  // salva metadata do workspace
  const meta: Meta = {
    owner: args.owner,
    repo: args.repo,
    prNumber: args.prNumber,
    headRef: args.headRef,
    baseRef: args.baseRef,
    headSha: args.headSha,
    resolvedCommit,
    createdAt: new Date().toISOString()
  };
  await fs.writeJson(path.join(ws, "metadata.json"), meta, { spaces: 2 });

  return { status: "ok" as const, diffKey: safeKey };
}

export async function applyResolvedCommit(args: {
  owner: string; repo: string; prNumber: number; headSha: string; // sha atual do PR
  token: string; cloneUrl: string; headRef: string; baseRef: string;
}) {
  const ws = wsPath(args.owner, args.repo, args.prNumber, args.headSha);
  const srcDir = path.join(ws, "src");
  const metaPath = path.join(ws, "metadata.json");
  const key = `${args.owner}/${args.repo}#${args.prNumber}-${args.headSha}`;
  const safeKey = key.replace(/[^a-zA-Z0-9._\-]/g, "_");

  // valida workspace existente
  if (!(await fs.pathExists(metaPath))) {
    return { ok: false as const, message: "Workspace não encontrado; reexecute o merge" };
  }
  const meta = (await fs.readJson(metaPath)) as Meta;

  // segurança: o headSha atual precisa bater com o meta.headSha (ou decidir permitir divergência)
  if (!args.headSha.startsWith(meta.headSha.slice(0, 7))) {
    return { ok: false as const, message: "Head do PR mudou; gere um novo diff" };
  }

  const remote = authedCloneUrl(args.cloneUrl, args.token);

  // garantir repo presente (se foi limpo, re-clonar)
  if (!(await fs.pathExists(path.join(srcDir, ".git")))) {
    await fs.emptyDir(srcDir);
    await execa("git", ["clone", "--no-tags", "--depth", "0", remote, srcDir]); // clone limpo [web:9]
    await execa("git", ["config", "user.name", "Merge-Helper"], withOpts(srcDir));
    await execa("git", ["config", "user.email", "bot@example.com"], withOpts(srcDir));
  }

  // sincroniza e aplica o commit resolvido no headRef atual
  await execa("git", ["remote", "set-url", "origin", remote], withOpts(srcDir));
  await execa("git", ["fetch", "--all", "--prune"], withOpts(srcDir));
  await execa("git", ["checkout", args.baseRef], withOpts(srcDir));

  try {
    // Fast-forward estrito: só avança se meta.resolvedCommit descende de origin/baseRef
    await execa("git", ["merge", "--ff-only", String(meta.resolvedCommit)], withOpts(srcDir));
    await execa("git", ["push", "origin", args.baseRef], withOpts(srcDir));
    await fs.rm(ws, { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(os.tmpdir(), "s3m-merge-helper-diffs", `${safeKey}.html`), { force: true }).catch(()=>{});
    return { ok: true as const, message: `Commit aplicado na branch ${args.baseRef}` };
  } catch (e: any) {
    // Base divergiu; é preciso reexecutar o mock para gerar um novo commit resolvido
    return { ok: false as const, message: "Base mudou; reexecute o merge para recalcular a resolução", log: e.stderr || e.message };
  }
}
