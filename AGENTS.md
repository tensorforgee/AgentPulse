# AgentPulse - AI Agent Observability Platform

## Project Overview

AgentPulse is an observability and reliability platform for AI agents.

It helps developers monitor, debug, evaluate, and understand AI-agent
executions in real-world workflows.

The platform captures agent execution telemetry such as:

- Agent runs
- Execution traces
- LLM calls
- Tool calls
- Latency
- Token usage
- Cost
- Errors
- Failures

AgentPulse presents this information through a web dashboard and provides
alerts and AI-assisted root-cause analysis.

---

## Repository Structure

```text
AgentPulse/
├── apps/
│   ├── web/        # Next.js frontend
│   └── api/        # NestJS backend
│
├── AGENTS.md
├── README.md
└── .gitignore