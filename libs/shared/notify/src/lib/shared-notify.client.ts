import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue, JobsOptions } from 'bullmq';
import { NOTIFY_QUEUE } from './shared-notify.constants';
import { NotifyJobName, NotifyRegistry } from './shared-notify.definitions';

@Injectable()
export class NotifyClient {
  constructor(@InjectQueue(NOTIFY_QUEUE) private readonly queue: Queue) {}

  /**
   * @param jobName
   * @param data
   * @param options
   */
  async emit<K extends NotifyJobName>(jobName: K, data: NotifyRegistry[K], options?: JobsOptions) {
    const defaultOptions: JobsOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    };
    await this.queue.add(jobName, data, { ...defaultOptions, ...options });
  }
}
