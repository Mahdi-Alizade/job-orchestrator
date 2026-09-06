# 🚀 Secure Job Orchestrator & CI Engine

A production-grade, isolated task execution engine built with NestJS, BullMQ, and Dockerode. It is engineered to run untrusted code, automated test suites, or ad-hoc background scripts inside locked-down, transient Docker containers without exposing the host system.

---

## 🏗 Architecture

The system implements a decoupled, event-driven pattern designed for resilience and horizontal scalability:

```text
[ Client / Webhook ]
         │ (POST /api/v1/tasks/execute)
         ▼
[ TaskManagerController ] ──► [ TaskManagerService ]
                                      │
                                      ▼ (Push Job)
                             [ Redis / BullMQ ]
                                      │
                                      ▼ (Consume Job)
                              [ JobsProcessor ]
                                      │
                                      ▼
                           [ DockerExecutorService ]
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
               [ Sandboxed Container ]    [ Auto-Cleanup & Logs ]
API Layer: Exposes validated REST endpoints (class-validator) to ingest execution requests.Message Broker (Redis + BullMQ): Manages distributed job queues, concurrency control,
exponential backoff retries, and persistence.Worker (JobsProcessor): Consumes jobs asynchronously to decouple long-running executions from HTTP request lifecycles.
Execution Sandbox (DockerExecutorService): Spawns isolated Docker containers with restricted kernel capabilities, streams standard output/error, applies execution timeouts,
and performs guaranteed teardown.🔒 Security & Sandboxing MatrixRunning untrusted arbitrary commands requires strict operational boundaries:Security VectorImplementation DetailPurposeNetwork IsolationNetworkMode: 'none'Blocks outbound internet access and lateral network movementResource CapsMemory: 512MB,
NanoCpus: 1.0Prevents Denial-of-Service and CPU exhaustion attacksProcess ThrottlingPidsLimit: 50Mitigates process fork-bomb exploitsLinux CapabilitiesCapDrop: ['ALL']Strips all root Linux kernel privilegesFilesystem IntegrityReadonlyRootfs: truePrevents root filesystem modifications or malicious persistenceScratch SpaceTmpfs: /tmp (size=64m, noexec, nosuid)Provides lightweight transient I/O while blocking script execution from tempHard TimeoutConfigurable execution kill switch (default: 30s)Terminates runaway processes or infinite loops (exit code 124)🛠 Tech StackRuntime & Framework: Node.js, TypeScript, NestJSQueue & Distributed Lock: Redis, BullMQContainerization & Orchestration: Docker,
DockerodeValidation & Pipeline: class-validator, class-transformer📥 Getting StartedPrerequisitesNode.js >= 20.xDocker Engine running locally or via Docker DesktopRedis instance (or use the provided docker-compose.yml)1. Clone & ConfigureBashgit clone <your-repository-url>
cd job-orchestrator
cp .env.sample .env
2. Start Supporting InfrastructureLaunch Redis with built-in health checks:Bashdocker compose up -d redis
3. Install Dependencies & BuildBashnpm install
npm run build
4. Run the EngineBash# Development mode
npm run start:dev

# Production mode
npm run start:prod
📡 API ReferenceEnqueue Execution TaskEndpoint: POST /api/v1/tasks/executeContent-Type: application/jsonRequest PayloadJSON{
  "imageName": "alpine:latest",
  "command": "echo 'Hello from secure sandbox' && uname -a"
}
Response (202 Accepted)JSON{
  "statusCode": 202,
  "message": "Task successfully enqueued for execution",
  "taskId": "7a3fa0b6-12c5-4bfe-9892-4f36c535398d"
}
🧪 TestingBash# Unit tests
npm run test

# End-to-end tests
npm run test:e2e

# Code coverage
npm run test:cov
📄 LicenseThis project is licensed under the MIT License.
