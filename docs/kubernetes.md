# Running SplunkEvents on Kubernetes or OpenShift

`deploy/helm/splunk-events` is a Helm chart for the whole app:
- the web app;
- the connector, which copies Splunk's scheduled reports into MongoDB on a schedule;
- optionally, the ML job.

MongoDB isn't part of the chart. Use your company's MongoDB, or Atlas. The chart only needs its address.

| Part | Kubernetes object | Image |
|---|---|---|
| Web app | Deployment, Service, and a Route (OpenShift) or an Ingress | `app` (Dockerfile target) |
| Connector (`worker/sync.ts`) | CronJob, every 15 minutes | `worker` (Dockerfile target) |
| ML job (`ml/score.py`), optional | CronJob, hourly | `ml/Dockerfile` |
| Demo accounts, optional | A Job after each install and upgrade | `worker` |
| The app's secrets | A Secret your platform provides, or one the chart makes | none |

It suits OpenShift's restricted security policy:
- everything runs as non-root, with no fixed user ID;
- no privilege escalation, and all capabilities dropped;
- the default seccomp profile;
- the images let OpenShift's random user ID (group 0) write where it must.

## 1. Build and push the images

Build them from the repo and push them to a registry your cluster can pull from.

```bash
REGISTRY=registry.example.com/your-team   # your registry
TAG=1.0.0

docker build --target app --build-arg DEMO_MODE=false -t $REGISTRY/splunk-events-app:$TAG .
docker build --target worker -t $REGISTRY/splunk-events-worker:$TAG .
docker build -f ml/Dockerfile -t $REGISTRY/splunk-events-ml:$TAG .
docker push $REGISTRY/splunk-events-app:$TAG    # and the other two
```

`DEMO_MODE` is built into the sign-in page:
- `false` for real data;
- `true` only for dummy data, together with `demo.enabled`.

## 2. Create the secrets

**The app's Secret.** The web app, the connector and the ML job all read it.

| Key | What |
|---|---|
| `MONGODB_URI` | The database, for example `mongodb+srv://…/splunkevents` |
| `BETTER_AUTH_SECRET` | 32+ random characters: `openssl rand -base64 32` |
| `REVALIDATE_SECRET` | Random too. The connector uses it to tell the web app about new data. |
| `GEMINI_API_KEY` | Optional. Turns on Ask AI ([ai.md](ai.md)). |
| `DEMO_PASSWORD` | Only with `demo.enabled` |

**The Splunk token's Secret.** It holds the service account's token. Only the connector's pods get it; the web app never sees it.

If your platform manages secrets (Vault, External Secrets…), create both there. By hand, it looks like this:

```bash
kubectl create secret generic splunk-events-secrets \
  --from-literal=MONGODB_URI='…' --from-literal=BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=REVALIDATE_SECRET="$(openssl rand -base64 32)"
kubectl create secret generic splunk-events-splunk-token --from-literal=SPLUNK_TOKEN='…'
```

**If Splunk's certificate comes from your company's own certificate authority,** put that authority's PEM file in a ConfigMap and name it in `connector.caBundle.configMap`. It becomes the connector's `NODE_EXTRA_CA_CERTS`. Don't turn off certificate checks.

```bash
kubectl create configmap company-ca-bundle --from-file=ca.crt=company-ca.pem
```

## 3. Install

Start from `values-openshift-example.yaml`. Copy it, fill in your values, and keep the copy with your platform's configuration, not in this repo.

```bash
helm install splunk-events deploy/helm/splunk-events -f your-values.yaml
helm upgrade splunk-events deploy/helm/splunk-events -f your-values.yaml     # later changes
kubectl create job --from=cronjob/splunk-events-connector splunk-events-sync-now   # sync now
```

The values that matter most:

| Value | What |
|---|---|
| `image.registry`, `image.tag` | Where your images are |
| `url` | The address people open. Sign-in only works from it. |
| `route.enabled` or `ingress.*` | How people reach it: a Route on OpenShift, an Ingress elsewhere |
| `connector.splunk.mode` | `live` for your Splunk. `fixture` serves the dummy reports, to try the chart before you have Splunk access. |
| `connector.splunk.baseUrl`, `timeZone`, `tokenSecret.name` | Your search head's management port (`https://…:8089`), its timezone, and the token's Secret |
| `connector.schedule` | How often to copy new runs. Keep it shorter than the reports' `dispatch.ttl`, or older runs lose their results first. |
| `secrets.existingSecret` | The app's Secret, from step 2 |
| `web.env` | Other settings from `.env.example`, such as `AI_ALLOW_LIVE_DATA` |
| `ml.enabled` | The ML job ([ml.md](ml.md)) |

`values.yaml` lists the rest, with comments. In `fixture` mode, also set `runRetentionDays: 3650`, because the dummy runs have fixed dates.

## Before you go live

- **Sign-in.** Today the app's only accounts are the demo accounts (`demo.enabled`), and those are for dummy data only. Signing in with your company's single sign-on (OIDC or SAML, against AD) is the next step to build.
- **One web pod.**
  - Each pod keeps its own copy of the report data, and the connector refreshes one pod after each sync.
  - With more pods, the others would show older data until their copies expire.
  - Running more needs the connector to refresh every pod, or a shared cache. Keep `web.replicas: 1` until then. Kubernetes restarts the pod if it fails.
- **AI.** With live data, Ask AI stays off until `AI_ALLOW_LIVE_DATA=true` ([ai.md](ai.md)). Use only an AI service your company has approved.

## What to ask your platform team

1. A namespace (an OpenShift project) that allows CronJobs.
2. A registry to push the three images to, and the pull secret for it, if needed (`imagePullSecrets`).
3. The app's address and its TLS certificate, for the Route or Ingress.
4. Where secrets come from: their secret manager, or Secrets you create.
5. Network access from the namespace:
   - to Splunk's management port (8089);
   - to MongoDB;
   - to the AI service, if you use one.
6. The company's certificate authority bundle, if their certificates come from it.

## How it's checked

CI's **Helm** workflow, on every change to the chart or the images:
1. Lints the chart, and renders it with the OpenShift example. It checks that the web app's pods never get the Splunk token.
2. Builds the three images and installs the chart on a throwaway kind cluster, with a test MongoDB, the dummy reports and the demo accounts.
3. Runs the connector and the ML job once, then signs in and reads the reports.

To try the connector against a real Splunk first, see [splunk-example.md](splunk-example.md) (Splunk's trial, in Docker).
