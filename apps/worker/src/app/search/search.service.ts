import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_SERVICE, DrizzleService } from '../../common/modules/drizzle.module';
import { TYPESENSE_CLIENT } from '../../common/modules/typesense.module';
import { Client as TypesenseClient } from 'typesense';
import { eq } from 'drizzle-orm';
import { authUsers, user } from '@libs/db/schemas';
import { SearchRegistry } from '@shared/worker';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(DRIZZLE_SERVICE) private readonly db: DrizzleService,
    @Inject(TYPESENSE_CLIENT) private readonly typesense: TypesenseClient,
  ) {}

  async syncUser({ userId, action }: SearchRegistry['search:sync-user']) {
    this.logger.log(`Syncing user ${userId} to Typesense...`);
    switch (action) {
      case 'delete': {
        try {
          await this.typesense.collections('users').documents(userId.toString()).delete();
          this.logger.log(`User ${userId} deleted from Typesense successfully`);
        } catch (error) {
          this.logger.error(`Failed to delete user ${userId} from Typesense: ${error.message}`);
        }
        break;
      }
      case 'upsert': {
        const [profile] = await this.db
          .select({
            id: user.id,
            username: authUsers.username,
            name: authUsers.name,
          })
          .from(user)
          .innerJoin(authUsers, eq(authUsers.id, user.id))
          .where(eq(user.id, userId))
          .limit(1);

        if (!profile) {
          this.logger.warn(`User ${userId} not found in database`);
          return;
        }

        const document = {
          id: profile.id,
          username: profile.username,
          name: profile.name,
        };

        await this.typesense.collections('users').documents().upsert(document);
        break;
      }
    }
    this.logger.log(`User ${userId} synced to Typesense successfully`);
  }
}
