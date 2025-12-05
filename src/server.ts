import { ApplicationFunctionOptions } from "probot";
import Express from "express";
import fs from "fs-extra";
import path from "path";
import os from "os";

export function CreateServer({ getRouter }: ApplicationFunctionOptions) {
    if (!getRouter) return;

    const router = getRouter()

    // Estáticos (opcional)
    router.use(Express.static("public"));

    // Healthcheck (opcional)
    router.get("/health", (_req, res) => res.send("ok"));

    // Rota para exibir o diff HTML
    router.get("/diff/:key", async (req, res) => {
        try {
            const key = req.params.key; // mesmo key usado no worker
            const storeDir = path.join(os.tmpdir(), "s3m-merge-helper-diffs");
            // sanitize leve do key aplicado também na gravação
            const safeKey = String(key).replace(/[^a-zA-Z0-9._#/-]/g, "_");
            const file = path.join(storeDir, `${safeKey}.html`);

            const exists = await fs.pathExists(file);
            if (!exists) {
                res.status(404).send("Diff não encontrado");
                return;
            }

            res.setHeader("Content-Type", "text/html; charset=utf-8");
            const html = await fs.readFile(file, "utf-8");
            res.send(html);
        } catch (e) {
            res.status(500).send("Erro ao carregar diff");
        }
    });

    router.get("/hello-world", (_req: any, res: any) => {
        res.send("Hello World");
    });
}