import { Injectable, type MessageEvent } from '@nestjs/common';
import { interval, map, merge, Observable, Subject } from 'rxjs';

export type RealtimeEventType = 'telemetry.ingested' | 'alert.triggered';

interface ProjectChannel {
  subscribers: number;
  subject: Subject<MessageEvent>;
}

@Injectable()
export class RealtimeEventsService {
  private readonly channels = new Map<string, ProjectChannel>();

  stream(projectId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const channel = this.channel(projectId);
      channel.subscribers += 1;

      const subscription = merge(
        channel.subject,
        interval(15_000).pipe(
          map((): MessageEvent => ({
            type: 'heartbeat',
            data: { timestamp: new Date().toISOString() },
          })),
        ),
      ).subscribe(subscriber);

      return () => {
        subscription.unsubscribe();
        channel.subscribers -= 1;
        if (channel.subscribers === 0) {
          channel.subject.complete();
          this.channels.delete(projectId);
        }
      };
    });
  }

  publish(projectId: string, type: RealtimeEventType, data: object): void {
    this.channels.get(projectId)?.subject.next({ type, data });
  }

  private channel(projectId: string): ProjectChannel {
    const existing = this.channels.get(projectId);
    if (existing) {
      return existing;
    }

    const channel = { subscribers: 0, subject: new Subject<MessageEvent>() };
    this.channels.set(projectId, channel);
    return channel;
  }
}
