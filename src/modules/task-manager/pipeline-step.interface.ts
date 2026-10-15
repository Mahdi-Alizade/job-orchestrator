export interface PipelineStep {
  name: string;
  command: string;
  continueOnError?: boolean;
}

export interface StepExecutionResult {
  stepName: string;
  command: string;
  exitCode: number;
  logs: string;
  durationMs: number;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
}

export interface PipelineExecutionReport {
  overallSuccess: boolean;
  totalDurationMs: number;
  steps: StepExecutionResult[];
}