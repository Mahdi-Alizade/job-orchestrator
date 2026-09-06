# 🚀 Secure Job Orchestrator & CI Engine

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/Framework-NestJS-red.svg)](https://nestjs.com/)
[![Dockerode](https://img.shields.io/badge/SDK-Dockerode-blue.svg)](https://github.com/apocas/dockerode)
[![BullMQ](https://img.shields.io/badge/Queue-BullMQ%20%2F%20Redis-orange.svg)](https://bullmq.io/)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

A high-performance, fault-tolerant execution engine built with **NestJS**, **BullMQ**, and **Dockerode**. 

This system is engineered specifically for safely running untrusted code snippets, automated CI/CD validation steps, or resource-heavy background tasks inside transient, strictly confined Docker containers without compromising the security or stability of the host machine.

---

## 📑 Table of Contents

- [Core Features](#-core-features)
- [Architecture & Data Flow](#-architecture--data-flow)
- [Security & Sandbox Isolation](#-security--sandbox-isolation)
- [Project Directory Layout](#-project-directory-layout)
- [Technology Stack](#-technology-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#environment-configuration)
  - [Running the Infrastructure](#running-the-infrastructure)
  - [Installation & Build](#installation--build)
  - [Starting the Application](#starting-the-application)
- [API Documentation](#-api-documentation)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Production Deployment (Docker)](#-production-deployment-docker)
- [License](#-license)

---

## ✨ Core Features

- **Transient Execution (Ephemeral Lifecycles)**: Each task executes in an isolated container that is torn down and force-removed immediately upon completion.
- **Asynchronous Decoupling**: API requests return instant acknowledgments (`202 Accepted`) with a unique `taskId`, offloading execution to background queues.
- **Strict Kernel Sandboxing**: Drops all root Linux capabilities, disables network interfaces, and locks down the filesystem as read-only.
- **Hard Resource Quotas**: Enforces strict caps on RAM, CPU quotas, and process limits (`pids-limit`) to prevent Fork Bombs and DoS attacks.
- **Execution Watchdog (Dead-man Switch)**: Terminates stuck or malicious infinite loops after a configurable timeout limit.
- **Demuxed Log Ingestion**: Automatically demultiplexes standard output (`stdout`) and standard error (`stderr`) streams directly from Docker's internal binary protocol.
- **Fault-Tolerant Scheduling**: Built on BullMQ with exponential backoff retries and configurable backpressure controls.

---

## 🏗 Architecture & Data Flow

The project follows a decoupled, event-driven pattern designed for resilience and horizontal scalability:

```text
       [ HTTP POST /api/v1/tasks/execute ]
                       │
                       ▼
          [ TaskManagerController ]
                       │  (Validates Payload via DTO)
                       ▼
           [ TaskManagerService ]
                       │  (Dispatches Job with UUID)
                       ▼
               [ BullMQ / Redis ]
                       │
             ┌─────────┴─────────┐
             │  Asynchronous     │
             │  Queue Worker     │
             ▼                   ▼
      [ JobsProcessor ]   [ JobsProcessor ] (Scalable Instances)
             │
             ▼
   [ DockerExecutorService ]
             │
    ┌────────┴─────────────────────────────────────────┐
    │ 1. Verify / Pull Target Image                    │
    │ 2. Instantiate Container (HostConfig Sandboxed)  │
    │ 3. Stream stdout / stderr                        │
    │ 4. Monitor Runtime Watchdog Timer                │
    │ 5. Force Cleanup Container & Volumes             │
    └──────────────────────────────────────────────────┘
🔒 Security & Sandbox IsolationExecuting arbitrary user-provided commands presents severe security challenges. This engine mitigates container escape and resource exhaustion using Linux kernel security layers:Security VectorSetting / MechanismThreat MitigatedNetwork AccessNetworkMode: 'none'Blocks data exfiltration, lateral network exploration, and external command-and-control communication.Memory CeilingMemory: 512MBPrevents Out-Of-Memory (OOM) crashes on the parent machine.CPU CapsNanoCpus: 1,000,000,000 (1 Core)Mitigates cryptocurrency mining or complete CPU starvation.Fork-Bomb ShieldPidsLimit: 50Blocks thread exhaustion and process-table flooding attacks (:(){ :|:& };:).Privilege RevocationCapDrop: ['ALL']Revokes default root Linux capabilities (e.g., CAP_SYS_ADMIN, CAP_NET_RAW).Read-Only Root FilesystemReadonlyRootfs: truePrevents disk persistence, system package modifications, or malicious binary injection.Transient Temp FSTmpfs: /tmp (size=64m, noexec, nosuid)Allows minimal temporary memory writes while strictly disabling execution of downloaded binaries from /tmp.Execution WatchdogProgrammable Timeout (Default: 30s)Prevents runaway scripts or infinite loops; returns exit code 124.📂 Project Directory LayoutPlaintextjob-orchestrator/
├── .env.sample                           # Sanitized configuration template
├── .gitignore                             # GitHub-safe exclusion rules
├── Dockerfile                             # Hardened multi-stage build definition
├── docker-compose.yml                     # Local development Redis infrastructure
├── package.json                           # Dependencies and NPM script definitions
├── tsconfig.json                          # Strict TypeScript compiler options
├── src/
│   ├── config/
│   │   └── configuration.ts               # Environment variable parsing and defaults
│   ├── modules/
│   │   └── task-manager/
│   │       ├── dto/
│   │       │   └── execute-task.dto.ts    # Class-validator schemas for task payloads
│   │       ├── processors/
│   │       │   └── jobs.processor.ts      # BullMQ worker handling execution tasks
│   │       ├── docker-executor.service.ts # Dockerode lifecycle, streaming, and sandbox
│   │       ├── task-manager.controller.ts # REST endpoints for job ingestion
│   │       ├── task-manager.module.ts     # Dependency injection graph for task domain
│   │       └── task-manager.service.ts    # Job enqueueing and validation layer
│   ├── app.module.ts                      # Root NestJS application module
│   ├── global.d.ts                        # Global ambient TypeScript definitions
│   └── main.ts                            # Bootstrap entrypoint with global pipes
🛠 Technology StackFramework & Core: NestJS, Node.js (v20+), TypeScriptTask Scheduling & State: BullMQ, Redis 7 (Alpine)Container Virtualization: Docker Engine, Dockerode SDKData Validation & Hygiene: class-validator, class-transformerProcess Orchestration: Tini init process (for Signal trapping inside Docker)📥 Getting StartedPrerequisitesNode.js: v20.x or laterDocker Engine: Installed and accessible via local socket (/var/run/docker.sock on Linux/macOS or //./pipe/docker_engine on Windows)Git: For version control managementEnvironment ConfigurationCopy the example environment template and configure parameters as needed:Bashcp .env.sample .env
VariableDescriptionDefaultPORTPort exposed by NestJS HTTP server3000NODE_ENVRuntime environment (development / production)developmentREDIS_HOSTHostname for Redis connectionlocalhostREDIS_PORTPort for Redis connection6379REDIS_PASSWORDPassword for protected Redis instances(empty)JOB_CONCURRENCYMaximum concurrent jobs processed per worker instance2JOB_MAX_RETRIESNumber of retry attempts on job failure3SANDBOX_TIMEOUT_MSMaximum duration (ms) an isolated container may execute30000SANDBOX_MAX_MEMORY_MBHard memory quota (MB) per container instance512Running the InfrastructureLaunch the isolated Redis broker instance using Docker Compose:Bashdocker compose up -d redis
Verify that the container is healthy:Bashdocker ps --filter "name=orchestrator-redis"
Installation & BuildInstall project dependencies and build the TypeScript codebase:Bashnpm install
npm run build
Starting the ApplicationBash# Development mode with hot-reload
npm run start:dev

# Production mode
npm run start:prod
📡 API Documentation1. Submit Execution TaskQueues a new task to be executed inside a sandboxed container.Method: POSTRoute: /api/v1/tasks/executeHeaders: Content-Type: application/jsonRequest BodyJSON{
  "imageName": "alpine:latest",
  "command": "echo 'Testing Sandbox' && cat /etc/os-release",
  "repoUrl": "[https://github.com/octocat/Hello-World](https://github.com/octocat/Hello-World)"
}
Field SpecificationsFieldTypeRequiredValidation RulesimageNamestringYesStandard Docker image tag (e.g., alpine:latest, node:18-alpine)commandstringYesShell command string (Max 500 characters)repoUrlstringNoValid HTTP / HTTPS URL formatResponse (202 Accepted)JSON{
  "statusCode": 202,
  "message": "Task successfully enqueued for execution",
  "taskId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
Error Response (400 Bad Request)JSON{
  "message": [
    "imageName must follow valid docker tag format (e.g., node:18-alpine, python:3.11-slim)",
    "command cannot exceed 500 characters"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
🧪 Testing & Quality AssuranceBash# Execute unit test suites
npm run test

# Run tests in watch mode
npm run test:watch

# Execute end-to-end integration tests
npm run test:e2e

# Generate test coverage reports
npm run test:cov
🐳 Production Deployment (Docker)The repository provides a multi-stage Dockerfile configured to run without root privileges:Bash# Build the production container image
docker build -t secure-job-orchestrator:latest .

# Run the container with host Docker socket mounted
docker run -d \
  --name job-orchestrator-app \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --env-file .env \
  secure-job-orchestrator:latest
Note for Production Security: When deploying to remote cloud hosts, ensure the host socket is mapped with proper access control or run against an isolated remote Docker daemon / rootless engine.📄 LicenseThis project is open-source software licensed under the MIT License.
