// server.js — minimal read-only Kubernetes UI backend
// Works in-cluster on k3s (ServiceAccount + RBAC) or locally via your kubeconfig.

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import * as k8s from "@kubernetes/client-node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Load Kubernetes config: prefer in-cluster, fall back to local kubeconfig
const kc = new k8s.KubeConfig();
try {
  kc.loadFromCluster();
  console.log("Loaded in-cluster Kubernetes config");
} catch (e) {
  kc.loadFromDefault();
  console.log("Loaded default kubeconfig (local dev)");
}

const core = kc.makeApiClient(k8s.CoreV1Api);
const apps = kc.makeApiClient(k8s.AppsV1Api);
const versionApi = kc.makeApiClient(k8s.VersionApi);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- API ---
app.get("/api/health", async (_req, res) => {
  try {
    const v = await versionApi.getCode();
    res.json({ ok: true, version: v.body.gitVersion });
  } catch {
    // still return ok so probes pass even if Version API is blocked
    res.status(200).json({ ok: true, version: "unknown" });
  }
});

app.get("/api/namespaces", async (_req, res) => {
  try {
    const r = await core.listNamespace();
    res.json(
      r.body.items.map((n) => ({
        name: n.metadata?.name,
        status: n.status?.phase,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: formatErr(err) });
  }
});

app.get("/api/pods", async (req, res) => {
  const ns = req.query.ns;
  try {
    const r =
      ns && ns !== "all"
        ? await core.listNamespacedPod(ns)
        : await core.listPodForAllNamespaces();
    res.json(r.body.items.map((p) => simplifyPod(p)));
  } catch (err) {
    res.status(500).json({ error: formatErr(err) });
  }
});

app.get("/api/deployments", async (req, res) => {
  const ns = req.query.ns;
  try {
    const r =
      ns && ns !== "all"
        ? await apps.listNamespacedDeployment(ns)
        : await apps.listDeploymentForAllNamespaces();
    res.json(
      r.body.items.map((d) => ({
        name: d.metadata?.name,
        namespace: d.metadata?.namespace,
        readyReplicas: d.status?.readyReplicas || 0,
        replicas: d.status?.replicas || 0,
        availableReplicas: d.status?.availableReplicas || 0,
        updatedReplicas: d.status?.updatedReplicas || 0,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: formatErr(err) });
  }
});

app.get("/api/services", async (req, res) => {
  const ns = req.query.ns;
  try {
    const r =
      ns && ns !== "all"
        ? await core.listNamespacedService(ns)
        : await core.listServiceForAllNamespaces();
    res.json(
      r.body.items.map((s) => ({
        name: s.metadata?.name,
        namespace: s.metadata?.namespace,
        type: s.spec?.type,
        clusterIP: s.spec?.clusterIP,
        ports: (s.spec?.ports || []).map(
          (p) => `${p.port}${p.nodePort ? `→${p.nodePort}` : ""}/${p.protocol}`
        ),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: formatErr(err) });
  }
});

// ---- helpers ----
function simplifyPod(p) {
  const c = p.status?.containerStatuses?.[0];
  return {
    name: p.metadata?.name,
    namespace: p.metadata?.namespace,
    phase: p.status?.phase,
    nodeName: p.spec?.nodeName,
    restarts: c?.restartCount || 0,
    ready: c
      ? `${c.ready ? "Yes" : "No"} (${
          c.ready
            ? ""
            : c.state?.waiting?.reason ||
              c.state?.terminated?.reason ||
              ""
        })`
      : "-",
    age: ageFrom(p.metadata?.creationTimestamp),
  };
}

function ageFrom(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatErr(err) {
  if (err?.response?.body?.message) return err.response.body.message;
  if (err?.message) return err.message;
  return String(err);
}

app.listen(PORT, () =>
  console.log(`kube-demo-ui listening on http://0.0.0.0:${PORT}`)
);
