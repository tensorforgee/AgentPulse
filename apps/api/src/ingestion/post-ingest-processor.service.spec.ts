import { Logger } from '@nestjs/common';
import type { AlertEvaluationService } from '../alert-rules/alert-evaluation.service';
import { PostIngestProcessorService } from './post-ingest-processor.service';

describe('PostIngestProcessorService', () => {
  let processor: PostIngestProcessorService;
  let evaluate: jest.MockedFunction<AlertEvaluationService['evaluate']>;

  beforeEach(() => {
    evaluate = jest.fn();
    processor = new PostIngestProcessorService({
      evaluate,
    } as unknown as AlertEvaluationService);
  });

  afterEach(() => {
    processor.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('queues work asynchronously and deduplicates an active trace job', async () => {
    let finishEvaluation: (() => void) | undefined;
    evaluate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishEvaluation = resolve;
        }),
    );

    expect(processor.enqueue('project-1', 'trace-1')).toBe(true);
    expect(processor.enqueue('project-1', 'trace-1')).toBe(false);
    expect(evaluate).not.toHaveBeenCalled();

    const idle = processor.waitForIdle();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(evaluate).toHaveBeenCalledTimes(1);

    finishEvaluation?.();
    await idle;
  });

  it('retries transient failures and completes on the third attempt', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    evaluate
      .mockRejectedValueOnce(new Error('sensitive database detail'))
      .mockRejectedValueOnce(new Error('sensitive provider detail'))
      .mockResolvedValueOnce();

    processor.enqueue('project-1', 'trace-2');
    await processor.waitForIdle();

    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('sensitive'));
  });

  it('stops after bounded retries and logs a sanitized terminal failure', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    evaluate.mockRejectedValue(new Error('sensitive failure detail'));

    processor.enqueue('project-1', 'trace-3');
    await processor.waitForIdle();

    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalledWith(
      expect.stringContaining('sensitive'),
    );
  });
});
