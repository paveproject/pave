import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { SEARCH_QUEUE, SearchJob } from '@shared/worker';
import { SearchService } from './search.service';

@Processor(SEARCH_QUEUE)
export class SearchProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchProcessor.name);

  constructor(private readonly searchService: SearchService) {
    super();
  }

  async process(job: SearchJob): Promise<void> {
    this.logger.log(`Processing job ${job.name} (ID: ${job.id})`);

    try {
      switch (job.name) {
        case 'search:sync-user':
          await this.searchService.syncUser(job.data);
          break;

        default:
          this.logger.warn(`Unhandled job`);
      }
    } catch (error) {
      this.logger.error(`Failed to process ${job.name}`, error);
      throw error;
    }
  }
}
