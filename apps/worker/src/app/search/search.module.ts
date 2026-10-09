import { Module } from '@nestjs/common';
import { SearchProcessor } from './search.processor';
import { SearchService } from './search.service';
import { TypesenseModule } from '../../common/modules/typesense.module';

@Module({
  imports: [TypesenseModule],
  providers: [SearchProcessor, SearchService],
})
export class SearchModule {}
