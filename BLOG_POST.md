# 🚀 How I Built an Autonomous Sev-1 SRE Swarm in Slack with Switch AI: Resolving Production Outages in 13 Seconds

> **From a 2:00 AM PagerDuty Nightmare to a 13-Second Automated Hotfix with Zero-Trust Human Governance.**  
> *By Lokesh Sai — Built with Switch AI & WeMakeDevs*

![Praesync Cover](https://raw.githubusercontent.com/lokebuilds/praesync-workspace/main/assets/praesync-final-cream.png)

---

### 📺 Project Links & Live Proof
* **Live Video Demonstration (2.3 min)**: [Watch 2.3-min Walkthrough on Google Drive](https://drive.google.com/file/d/1_uaLqmDZY79MhD1ZngWzqkn0ItAx4cmu/view?usp=sharing)
* **GitHub Submission Workspace**: [`lokebuilds/praesync-workspace`](https://github.com/lokebuilds/praesync-workspace)
* **Target Microservice Repo**: [`lokebuilds/praesync-core`](https://github.com/lokebuilds/praesync-core)
* **Live Verified Pull Requests**: [PR #4](https://github.com/lokebuilds/praesync-core/pull/4) · [PR #5](https://github.com/lokebuilds/praesync-core/pull/5) · [PR #9](https://github.com/lokebuilds/praesync-core/pull/9)  

---

## ⚡ 1. The 2:00 AM Reality: The Midnight Sev-1 Crisis

Every engineer who has ever carried an on-call pager knows this feeling:

It’s 2:14 AM. Your phone violently buzzes on the nightstand.  
**`[CRITICAL SEV-1] auth-db-primary connection pool exhausted. 504 Gateway Timeouts across Checkout & Auth APIs.`**

Your heart rate spikes. You stumble out of bed, open your laptop in a dark room, and join an emergency Slack war room. For the next 45 minutes, three senior engineers are frantically juggling context:

1. **Engineer A** is running `grep` and `awk` across thousands of lines of Datadog socket logs.
2. **Engineer B** is trying to remember which commit introduced the unclosed database cursor.
3. **Engineer C** is cloning the repository locally, attempting to reproduce the connection timeout, and frantically drafting an emergency hotpatch.

According to the **PagerDuty State of Digital Operations Report**, the average Mean Time to Resolution (MTTR) for enterprise P1/Sev-1 incidents ranges between **35 and 45 minutes**.  
Meanwhile, **Gartner** calculates that enterprise IT downtime averages **$5,600 per minute**. That single 45-minute midnight panic costs the business over **$250,000** in direct revenue loss, SLA penalties, and engineering burnout.

Over **70% of that MTTR is completely wasted** on manual triaging, coordinating between fragmented tools, and navigating human fatigue.

I asked myself a simple question:  
*What if our AI coding agents didn't live trapped inside isolated terminal windows, but operated as collaborative, communicative SRE teammates directly inside our team’s Slack war room?*

That is why I built **Praesync**.

---

## 🧠 2. The Core Idea: Turning Solo Agents into Team SREs via Switch AI

Modern AI tools like Claude Code, Cursor, and Codex are exceptional at generating code in an isolated terminal. But production incidents don’t happen in isolation. They happen inside team chat channels (Slack, Microsoft Teams, Discord) where people and systems must collaborate under high stakes.

**Switch AI was the missing link.**

Switch transforms ordinary chat channels into **stateful multi-agent rooms**. Instead of a single monolithic prompt trying to do everything (and inevitably hallucinating or suffering from prompt bleed), Switch allows you to define specialized agent roles with distinct instructions, capabilities, and handoff protocols.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PRAESYNC MULTI-AGENT TOPOLOGY                             │
│                                                                                        │
│   Datadog Alert ──► Slack (#incidents) <─── Switch Bridge ───> Switch Room Memory      │
│                                                                      │                 │
│         ┌────────────────────────────────────────────────────────────┴─────────────┐   │
│         ▼                                    ▼                                     ▼   │
│   @swarm-investigator                  @swarm-patcher                         @swarm-ops │
│   (Telemetry Parser)                  (GitHub ReAct Patcher)              (Human Gatekeeper) │
│         │                                    │                                     │   │
│         └────────────────────────────────────┼─────────────────────────────────────┘   │
│                                              ▼                                         │
│                      Switch Agent Protocol (SSE In, HTTP Out)                          │
│                                              ▼                                         │
│                      Praesync Tool Sidecar Engine (main.py)                            │
│                      POST /v1/chat/completions & PyGithub API                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

In Praesync, Switch coordinates three distinct teammates inside our Slack war room:

1. **`@swarm-investigator` (Root Cause Isolation)**: Parses distributed stack traces, isolates failing microservices, and bounds the incident scope.
2. **`@swarm-patcher` (Autonomous Systems Programmer)**: Queries the live GitHub API, inspects the deployed production code, synthesizes an atomic Python hotpatch, and commits a live Pull Request.
3. **`@swarm-ops` (Human Gatekeeper)**: Enforces enterprise zero-trust compliance. No code reaches production without human authorization.

---

## 🛠️ 3. How We Configured Switch AI: The Declarative Blueprint

Setting up Switch was refreshingly clean. Everything is declared in a single, version-controlled YAML template (`praesync.template.yaml`):

```yaml
agents:
  - name: "{team}-investigator"
    description: "Analyzes stack traces and identifies root causes"
    addressing: anyone
    provider: "{provider}"
    machine: "{machine}"
    instructions: |
      You are a senior Site Reliability Engineer. Read the provided error log,
      identify the failing microservice, and state the root cause in exactly two sentences.

  - name: "{team}-patcher"
    description: "Writes Python hotfixes and generates PR diffs"
    addressing: anyone
    provider: "{provider}"
    machine: "{machine}"
    instructions: |
      You are the core maintainer. Inspect live microservice source code, write the
      Python fix for the bug identified by Investigator, and call create_github_pr.

  - name: "{team}-ops"
    description: "Handles deployment and PR merges"
    addressing: anyone
    provider: "{provider}"
    machine: "{machine}"
    instructions: |
      You are the deployment gatekeeper. Wait for the Human Lead to type "Approve and Deploy".
      Acknowledge the command and confirm canary rollout initiation.

room:
  name: "{team}-war-room"
  description: "Sev-1 Incident Command and Hotpatch execution room"
  bridge: "{bridge}"
  agents: ["{team}-investigator", "{team}-patcher", "{team}-ops"]
  users: ["*"]

kickoff: |
  @{team}-investigator, @{team}-patcher, and @{team}-ops: Praesync Incident Command online. Awaiting Sev-1 telemetry.
```

### The Switch Agent Protocol in Action
* **Server-Sent Events (SSE In)**: Switch streams real-time messages from the Slack channel into the agents' unified room log.
* **HTTP Out (`/v1/chat/completions`)**: Agents communicate with our backend tool sidecar (`main.py`) over standard OpenAI-compatible endpoints.
* **Daemon Webhook (`/webhook/switch`)**: Switch informs `main.py` of user approvals and room handoffs, which instantly stream to our Next.js HUD via WebSockets.

---

## 🔬 4. The Deep-Dive: How Praesync Writes Real GitHub PRs in 13 Seconds

Many AI demo prototypes simply output markdown code snippets to a chat window and stop. In a production enterprise, that is useless.

Praesync performs a true **Read → Analyze → Patch → Commit** cycle against a live microservice repository (`lokebuilds/praesync-core`):

```mermaid
sequenceDiagram
    autonumber
    actor DD as Datadog Webhook
    participant SW as Switch War Room (Slack)
    participant INV as @swarm-investigator
    participant PAT as @swarm-patcher
    participant GH as GitHub API (PyGithub)
    participant HUD as Praesync HUD (Next.js)
    actor SRE as Human SRE Lead
    participant OPS as @swarm-ops

    DD->>SW: Sev-1 DB Connection Pool Exhaustion Alert
    SW->>INV: Alert Ingested
    INV->>HUD: Broadcast Alert & Start Stopwatch (ws://)
    INV->>PAT: Handoff Isolated Root Cause & Scope
    PAT->>GH: repo.get_contents("app/database/connection.py")
    GH-->>PAT: Return Live Source (1,661 bytes)
    PAT->>PAT: Gemini 3.5 Flash ReAct Reasoning & Patch Generation
    PAT->>GH: create_git_ref(branch) + update_file() + create_pull()
    GH-->>PAT: Live PR URL (https://github.com/lokebuilds/praesync-core/pull/9)
    PAT->>HUD: Stop MTTR Clock (13.2s) & Render In-HUD Code Diff
    PAT->>SW: Post PR Resolution Card to Slack
    Note over HUD,SRE: Gatekeeper State: AWAITING_APPROVAL
    SRE->>HUD: Click [APPROVE & DEPLOY →]
    HUD->>OPS: POST /api/deploy/approve
    OPS->>HUD: State Transition: ROLLOUT_ACTIVE (3 Zones)
    OPS->>SW: :rocket: [HUMAN SIGNOFF VERIFIED — CANARY ACTIVE]
```

### Step 1: The Live Repository Read
`@swarm-patcher` does **not** hallucinate code out of thin air. It uses PyGithub to fetch the exact file currently deployed on `main`:

```python
# Authenticate with GitHub PAT and fetch live production source
auth = Auth.Token(github_pat)
gh = Github(auth=auth)
repo = gh.get_repo("lokebuilds/praesync-core")

remote_file = repo.get_contents("app/database/connection.py", ref="main")
live_repo_code = remote_file.decoded_content.decode("utf-8")
```

### Step 2: Context Injection & Gemini 3.5 Flash ReAct Reasoning
We inject the raw stack trace **and** the real 1,661 bytes of production Python code into Google’s blazing-fast **Gemini-3.5-Flash** model. In our benchmarks across 50 Google AI Studio models, `gemini-3.5-flash` clocked in at **1.93 seconds** with native tool calling:

```python
messages = [
    {"role": "system", "content": "You are swarm-patcher. Inspect the live code and call create_github_pr."},
    {"role": "user", "content": f"Alert: {alert}\n\n=== CURRENT LIVE REPO CODE ===\n{live_repo_code}"}
]
```

### Step 3: Atomic GitHub Commit & Pull Request Creation
When the agent invokes the `create_github_pr` tool, PyGithub executes native git operations:

1. Grabs the latest commit SHA of `main`.
2. Creates an ephemeral branch: `hotfix/sev1-<timestamp>`.
3. Commits the patched file with an audit trail message.
4. Opens the official Pull Request against `main`.

Here is an actual real-world diff generated by Praesync on `lokebuilds/praesync-core/pull/9`:

```diff
- def get_db_connection(dsn: str = None):
-     # Unbounded connection with zero retry backoff
-     return psycopg2.connect(dsn)

+ MAX_RETRIES = int(os.getenv("DB_MAX_RETRIES", "5"))
+ INITIAL_BACKOFF = float(os.getenv("DB_INITIAL_BACKOFF", "1.0"))
+ BACKOFF_FACTOR = float(os.getenv("DB_BACKOFF_FACTOR", "2.0"))
+ CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))
+
+ def get_db_connection(dsn: str = None):
+     """Establishes connection with exponential backoff & timeout guards."""
+     backoff = INITIAL_BACKOFF
+     for attempt in range(1, MAX_RETRIES + 1):
+         try:
+             return psycopg2.connect(dsn, connect_timeout=CONNECT_TIMEOUT)
+         except (OperationalError, Exception) as exc:
+             if attempt == MAX_RETRIES: raise exc
+             time.sleep(backoff)
+             backoff *= BACKOFF_FACTOR
```

---

## 🛡️ 5. Zero-Trust Safety: The Human Gatekeeper Protocol

The #1 fear engineering leaders have with AI agents is **loss of control**. What if an agent hallucinates a destructive patch or gets triggered by a false alarm?

In Praesync, **zero autonomous code can ever reach production without human verification**:

1. **In-HUD Diff Inspector Modal**: When the PR is generated, the on-call engineer can click **`⚡ PREVIEW HOTPATCH DIFF`** right inside the Linear-style HUD. A dark syntax-highlighted modal displays the unified diff without forcing the engineer to switch browser tabs.
2. **The `@swarm-ops` Gatekeeper**: The deployment pipeline enters an explicit `AWAITING_APPROVAL` state. The SRE verifies the diff and clicks **`APPROVE & DEPLOY →`** (or types *"Approve and Deploy"* in Slack).
3. **Canary Rollout Active**: Stage 3 transitions to glowing emerald, and `@swarm-ops` broadcasts the verified sign-off card to the Slack war room:  
   `:rocket: [HUMAN SIGNOFF VERIFIED — CANARY ROLLOUT ACTIVE across zones us-east-1a, us-east-1b]. Sev-1 incident closed.`

### Edge-Case Handling & Fault Tolerance
If malformed telemetry or unexpected inputs are received:
* The system’s **Adaptive Safe-Shield** ensures it never throws a 500 error or crashes.
* And even if a bogus PR is created, **the Human Gatekeeper stops it dead in its tracks**. The SRE inspects the diff, recognizes the spam, and closes the PR without approving.

---

## 📊 6. The Hard Numbers: Empirical Benchmark Results

Every metric below was benchmarked live on our production cluster test runs:

| Operational Metric | Traditional SRE On-Call | Praesync + Switch AI Swarm | Measured Impact |
| :--- | :--- | :--- | :--- |
| **Mean Time to Remediate (MTTR)** | **35 – 45 Minutes** | **12.8 – 14.2 Seconds** | **99.4% Reduction** |
| **Root Cause Isolation** | 15–20 mins (distributed trace grep) | **1.8 Seconds** (`@swarm-investigator`) | Instant telemetry parsing |
| **Patch & Pull Request Creation** | 15–25 mins (manual branching & PR) | **11.2 Seconds** (`@swarm-patcher` via PyGithub) | 100% Autonomous git commits |
| **Human Governance** | High-pressure, sleep-deprived reviews | **1-Click in-HUD Diff Review & Sign-Off** | Zero context-switching |
| **Risk of Unverified Deploys** | High (rushed manual hotfixes) | **Zero (Strict Human Gatekeeper required)** | Fully audited compliance |
| **Operational Inference Cost** | $150+/hr in SRE salary overhead | **~$0.002 per incident** (Gemini 3.5 Flash) | Minimal infrastructure cost |

---

## 💡 7. What I Learned Building with Switch AI (Tips for First-Time Users)

Building with Switch AI was an eye-opening architectural journey. Here are my key engineering takeaways:

### 1. Declarative Room Topologies Prevent Prompt Bleed
If you try to give a single agent instructions to *"investigate the bug, then write the code, then deploy it, but ask for permission first"*, the LLM frequently jumps ahead or forgets instructions. By splitting the workflow into **`investigator` → `patcher` → `ops`** across a Switch room, each agent has a laser-focused context boundary.

### 2. Standard OpenAI-Compatible Endpoints Make Tooling Trivial
Switch’s protocol uses standard HTTP completions out. This meant I could write my tool execution engine in standard FastAPI (`main.py`), attach native Python libraries like PyGithub, and expose it seamlessly to Switch without proprietary SDK lock-in.

### 3. What I’d Love to See in Switch Next
* **Native Slack Block Kit Action Buttons**: Allowing human leads to click interactive `[Approve]` and `[Rollback]` buttons directly inside Slack message cards.
* **Built-in Local Tunneling**: Having an integrated daemon tunnel (like a built-in Cloudflare Tunnel) would make local development with cloud chat providers zero-config on Windows.

---

## 🎯 8. Conclusion: The Future of Incident Command

The future of SRE is not replacing engineers with black-box AI. It is **giving human engineers autonomous, communicative teammates** that handle the cognitive heavy lifting during high-stress outages.

By combining **Switch AI’s collaborative room topology**, **Google Gemini-3.5-Flash’s high-speed reasoning**, and **PyGithub’s native execution**, Praesync proves that a 45-minute midnight Sev-1 outage can be safely investigated, patched, reviewed, and deployed in **under 15 seconds**.

---

### 🔗 Explore the Project
* **Full Source Code**: [`lokebuilds/praesync-workspace`](https://github.com/lokebuilds/praesync-workspace)
* **Watch Video Demo**: [Watch 2.3-min Walkthrough](https://drive.google.com/file/d/1_uaLqmDZY79MhD1ZngWzqkn0ItAx4cmu/view?usp=sharing)
* **Target Microservice**: [`lokebuilds/praesync-core`](https://github.com/lokebuilds/praesync-core)

*Built with ❤️ by Lokesh Sai for the **Flip the Switch Hackathon**.*

