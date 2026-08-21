import { RealtimeEventsService } from './realtime-events.service';

describe('RealtimeEventsService', () => {
  it('publishes events only to subscribers for the matching project', () => {
    const service = new RealtimeEventsService();
    const first: unknown[] = [];
    const second: unknown[] = [];
    const firstSubscription = service
      .stream('project-a')
      .subscribe((event) => first.push(event));
    const secondSubscription = service
      .stream('project-b')
      .subscribe((event) => second.push(event));

    service.publish('project-a', 'telemetry.ingested', { traceId: 'trace-a' });

    expect(first).toEqual([
      {
        type: 'telemetry.ingested',
        data: { traceId: 'trace-a' },
      },
    ]);
    expect(second).toEqual([]);
    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();
  });
});
