import type { ApplicationFunctionOptions, Probot } from "probot";
import { CreateServer } from "./server.js";
import { runMockMergeForPR, applyResolvedCommit } from "./worker.js";

const CHECK_NAME = "sesame-merge-helper";

export default (app: Probot, { getRouter }: ApplicationFunctionOptions) => {
  CreateServer({ getRouter });
  app.log.info(`${CHECK_NAME} carregado`);

  app.on(["pull_request.opened","pull_request.reopened","pull_request.synchronize"], async (context) => {
    console.log("Evento PR recebido");
    const pr = context.payload.pull_request;
    const { owner, repo } = context.repo();
    const prNumber = pr.number;
    const headSha = pr.head.sha;
    const headRef = pr.head.ref;
    const baseRef = pr.base.ref;
    const cloneUrl = context.payload.repository.clone_url;
    const installationId = context.payload.installation?.id!;
    const auth = await context.octokit.auth({ type: "installation", installationId });
    const token = (auth as any).token as string;

    const externalId = `${prNumber}:${headSha.slice(0, 7)}`;

    const created = await context.octokit.rest.checks.create({
      ...context.repo(),
      name: CHECK_NAME,
      head_sha: headSha,
      status: "in_progress",
      started_at: new Date().toISOString(),
      external_id: externalId,
      output: {
        title: "Tentando merge semiestruturado (mock)",
        summary: "O bot vai tentar resolver conflitos e publicar um diff se possível.",
        text: "Aguarde alguns instantes; o link do diff aparecerá quando pronto."
      }
    });

    const checkRunId = created.data.id;

    queueMicrotask(async () => {
      const result = await runMockMergeForPR({ owner, repo, prNumber, headRef, baseRef, headSha, cloneUrl, token });

      if (result.status !== "ok") {
        await context.octokit.rest.checks.update({
          owner,
          repo,
          check_run_id: checkRunId,
          status: "completed",
          conclusion: "failure",
          completed_at: new Date().toISOString(),
          output: {
            title: "Não foi possível resolver com mock",
            summary: result.reason || "Conflitos não resolvidos automaticamente",
            text: ""
          }
        });
        return;
      }

      const baseUrl = process.env.BASE_URL || "http://localhost:3000";
      const detailsUrl = `${baseUrl}/diff/${encodeURIComponent(result.diffKey)}`;

      await context.octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        status: "completed",
        conclusion: "neutral",
        details_url: detailsUrl,
        completed_at: new Date().toISOString(),
        output: {
          title: "Diff gerado pelo mock",
          summary: "Revise o diff e clique no botão para aplicar o commit na branch do PR.",
          text: "O commit será criado pelo bot quando o botão for clicado."
        },
        actions: [
          { label: "Aplicar commit", description: "Cria commit com patch mock", identifier: "apply_fix" }
        ]
      });
    });
  });

  app.on("check_run.requested_action", async (context) => {
    if (context.payload.requested_action.identifier !== "apply_fix") return;

    const { owner, repo } = context.repo();
    const external = context.payload.check_run.external_id || "";
    const [prStr] = external.split(":");
    const prNumber = Number(prStr);

    // token instalação
    const installationId = context.payload.installation?.id!;
    const auth = await context.octokit.auth({ type: "installation", installationId });
    const token = (auth as any).token as string;

    // obter refs/sha atuais do PR
    const pr = await context.octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    const headRef = pr.data.head.ref;
    const baseRef = pr.data.base.ref;
    const headSha = pr.data.head.sha;
    const cloneUrl = context.payload.repository.clone_url;

    const res = await applyResolvedCommit({
      owner, repo, prNumber, headSha, token, cloneUrl, headRef, baseRef
    });

    // Verifica se o PR foi reconhecido como merged e faz fallback se necessário
    let merged = false;
    try {
      await context.octokit.rest.pulls.checkIfMerged({ owner, repo, pull_number: prNumber });
      merged = true;
    } catch {
      merged = false;
    }

    if (!merged && res.ok) {
      // Fallback: fecha o PR explicitamente se por algum motivo não foi detectado como merged
      await context.octokit.rest.pulls.update({
        owner, repo, pull_number: prNumber, state: "closed"
      });
    }


    await context.octokit.rest.checks.update({
      owner, repo,
      check_run_id: context.payload.check_run.id,
      status: "completed",
      conclusion: res.ok ? "success" : "failure",
      completed_at: new Date().toISOString(),
      output: {
        title: res.ok ? "Commit aplicado" : "Falha ao aplicar commit",
        summary: res.message,
        text: res.log || ""
      }
    }); // fecha o check conforme resultado [web:9]
  });

  app.on("check_run.rerequested", async (context) => {
    const { owner, repo } = context.repo();
    const cr = context.payload.check_run;
    const pr = cr.pull_requests?.[0];
    if (!pr) return;

    const prNumber = pr.number;
    const headSha = cr.head_sha;
    const headRef = pr.head.ref;
    const baseRef = pr.base.ref;
    const cloneUrl = context.payload.repository.clone_url;

    const installationId = context.payload.installation?.id!;
    const auth = await context.octokit.auth({ type: "installation", installationId });
    const token = (auth as any).token as string;

    const checkRunId = cr.id;
    const externalId = `${prNumber}:${headSha.slice(0, 7)}`;

    await context.octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status: "in_progress",
      started_at: new Date().toISOString(),
      external_id: externalId,
      output: {
        title: "Reexecutando merge semiestruturado (mock)",
        summary: "O bot está reprocessando o diff para este PR.",
        text: "Aguarde alguns instantes; o link do diff será atualizado se necessário."
      }
    });

    setTimeout(async () => {
      const result = await runMockMergeForPR({
        owner,
        repo,
        prNumber,
        headRef,
        baseRef,
        headSha,
        cloneUrl,
        token
      });

      if (result.status !== "ok") {
        await context.octokit.rest.checks.update({
          owner,
          repo,
          check_run_id: checkRunId,
          status: "completed",
          conclusion: "failure",
          completed_at: new Date().toISOString(),
          output: {
            title: "Não foi possível resolver com mock",
            summary: result.reason || "Conflitos não resolvidos automaticamente",
            text: ""
          }
        });
        return;
      }

      const baseUrl = process.env.BASE_URL || "http://localhost:3000";
      const detailsUrl = `${baseUrl}/diff/${encodeURIComponent(result.diffKey)}`;

      await context.octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        status: "completed",
        conclusion: "neutral",
        details_url: detailsUrl,
        completed_at: new Date().toISOString(),
        output: {
          title: "Diff gerado pelo mock",
          summary: "Revise o diff e clique no botão para aplicar o commit na branch do PR.",
          text: "O commit será criado pelo bot quando o botão for clicado."
        },
        actions: [
          {
            label: "Aplicar commit",
            description: "Cria commit com patch mock",
            identifier: "apply_fix"
          }
        ]
      });
    }, 0);
  });
};
