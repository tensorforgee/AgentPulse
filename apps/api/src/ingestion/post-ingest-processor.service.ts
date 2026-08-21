import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { AlertEvaluationService } from '../alert-rules/alert-evaluation.service';

const MAX_CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [250, 1_000] as const;

interface PostIngestJob {
  attempt: number;
  key: string;
  projectId: string;
  traceId: string;
}

@Injectable()
export class PostIngestProcessorService implements OnModuleDestroy {
  private readonly logger = new Logger(PostIngestProcessorService.name);
  private readonly knownJobs = new Set<string>();
  private readonly queue: PostIngestJob[] = [];
  private readonly retryTimers = new Set<NodeJS.Timeout>();
  private readonly idleWaiters = new Set<() => void>();
  private activeJobs = 0;
  private drainHandle: NodeJS.Immediate | null = null;
  private shuttingDown = false;

  constructor(private readonly alertEvaluation: AlertEvaluationService) {}

  enqueue(projectId: string, traceId: string): boolean {
    if (this.shuttingDown) {
      return false;
    }

    const key = `${projectId}:${traceId}`;
    if (this.knownJobs.has(key)) {
      return false;
    }

    this.knownJobs.add(key);
    this.queue.push({ attempt: 1, key, projectId, traceId });
    this.scheduleDrain();
    return true;
  }

  waitForIdle(): Promise<void> {
    if (this.knownJobs.size === 0 && this.activeJobs === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    if (this.drainHandle) {
      clearImmediate(this.drainHandle);
      this.drainHandle = null;
    }
    for (const timer of this.retryTimers) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    this.queue.length = 0;
    this.knownJobs.clear();
    this.resolveIdleWaiters();
  }

  private scheduleDrain(): void {
    if (this.shuttingDown || this.drainHandle) {
      return;
    }

    this.drainHandle = setImmediate(() => {
      this.drainHandle = null;
      this.drain();
    });
  }

  private drain(): void {
    while (
      !this.shuttingDown &&
      this.activeJobs < MAX_CONCURRENCY &&
      this.queue.length > 0
    ) {
      const job = this.queue.shift();
      if (!job) {
        break;
      }

      this.activeJobs += 1;
      void this.process(job);
    }
    this.resolveIdleWaitersIfIdle();
  }

  private async process(job: PostIngestJob): Promise<void> {
    try {
      await this.alertEvaluation.evaluate(job.projectId, job.traceId);
      this.knownJobs.delete(job.key);
    } catch {
      if (!this.shuttingDown && job.attempt < MAX_ATTEMPTS) {
        this.logger.warn(
          `Post-ingest processing failed for trace ${job.traceId}; retrying attempt ${job.attempt + 1} of ${MAX_ATTEMPTS}`,
        );
        this.scheduleRetry({ ...job, attempt: job.attempt + 1 });
      } else {
        this.knownJobs.delete(job.key);
        if (!this.shuttingDown) {
          this.logger.error(
            `Post-ingest processing failed for trace ${job.traceId} after ${job.attempt} attempts`,
          );
        }
      }
    } finally {
      this.activeJobs -= 1;
      this.scheduleDrain();
      this.resolveIdleWaitersIfIdle();
    }
  }

  private scheduleRetry(job: PostIngestJob): void {
    const delay = RETRY_DELAYS_MS[job.attempt - 2];
    const timer = setTimeout(() => {
      this.retryTimers.delete(timer);
      if (this.shuttingDown) {
        this.knownJobs.delete(job.key);
        this.resolveIdleWaitersIfIdle();
        return;
      }

      this.queue.push(job);
      this.scheduleDrain();
    }, delay);
    timer.unref();
    this.retryTimers.add(timer);
  }

  private resolveIdleWaitersIfIdle(): void {
    if (this.knownJobs.size === 0 && this.activeJobs === 0) {
      this.resolveIdleWaiters();
    }
  }

  private resolveIdleWaiters(): void {
    for (const resolve of this.idleWaiters) {
      resolve();
    }
    this.idleWaiters.clear();
  }
}
