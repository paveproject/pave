import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue, JobsOptions } from 'bullmq';
import { WorkerJobName, WorkerRegistry, WorkerSchemas } from './shared-worker.definitions';
import { SEARCH_PATH, SEARCH_QUEUE } from './search/search.registry';
import z from 'zod';

@Injectable()
export class WorkerClient {
  private readonly logger = new Logger(WorkerClient.name);
  constructor(@InjectQueue(SEARCH_QUEUE) private readonly searchQueue: Queue) {}

  /**
   * @param jobName
   * @param data
   * @param options
   */
  async emit<K extends WorkerJobName>(jobName: K, data: WorkerRegistry[K], options?: JobsOptions) {
    const defaultOptions: JobsOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    };

    let payloadToSend = data;

    const schema = (WorkerSchemas as Record<string, z.ZodType>)[jobName as string];

    if (schema) {
      try {
        payloadToSend = schema.parse(data) as WorkerRegistry[K];
      } catch (error) {
        this.logger.error(`Validation failed for job ${jobName}`, error);
        throw error;
      }
    } else {
      this.logger.warn(`No validation schema found for job: ${jobName}`);
    }

    let targetQueue: Queue;

    const jobPrefix = jobName.split(':')[0];

    switch (jobPrefix) {
      case SEARCH_PATH: {
        targetQueue = this.searchQueue;
        break;
      }
      default: {
        this.logger.error(`Unknown job prefix: ${jobPrefix} for job ${jobName}`);
        throw new Error(`Unknown job prefix: ${jobPrefix}`);
      }
    }

    await targetQueue.add(jobName, payloadToSend, { ...defaultOptions, ...options });
  }
}
