# 🚀 Secure Job Orchestrator & CI Engine

A production-grade, isolated execution engine built with NestJS and Dockerode. Designed to run untrusted code or heavy test suites safely within ephemeral containers without risking the host system.

## 🏗 Architecture Overview
The system uses a decoupled architecture based on the **Observer-Dispatcher-Worker** pattern:
1. **API Layer**: Accepts payloads via RESTful endpoints.
2. **Message Broker (Redis/BullMQ)**: Manages high-volume job queuing, retries, and back-pressure handling.
3. **Workers**: Consume jobs and spawn **isolated Docker containers**.
4. **Executor (Dockerode)**: Spins up the container, executes the command, captures stdout/stderr logs, and tears down the container immediately after execution.

## ✨ Features
- **Isolation by Default**: Every task runs inside its own transient Docker container. Host system remains completely safe from malicious scripts or resource leaks.
- **Fault Tolerance**: Built-in retry logic using exponential backoff (BullMQ).
- **Security**: Strict Input Validation using ClassValidator; Non-root user deployment via Multi-stage Dockerfiles.
- **Extensible**: Easy to add more processors (e.g., GPU-based workers) or integrate with Git Webhooks.

## 🛠 Tech Stack
| Component | Technology |
| :--- | :--- |
| **Runtime** | Node.js / TypeScript |
| **Framework** | NestJS (Modular Architecture) |
| **Database / Cache** | PostgreSQL, Redis (for BullMQ) |
| **Containerization** | Docker & Dockerode SDK |
| **Validation** | class-validator + class-transformer |

## 📥 Installation & Run
1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd job-orchestrator