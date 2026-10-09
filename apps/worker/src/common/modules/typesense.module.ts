import { Module } from '@nestjs/common';
import { Client } from 'typesense';
import { EnvService, ENV_SERVICE } from '@libs/env';

export const TYPESENSE_CLIENT = Symbol('typesense-client');

@Module({
  providers: [
    {
      provide: TYPESENSE_CLIENT,
      inject: [ENV_SERVICE],
      useFactory: (env: EnvService) => {
        return new Client({
          nodes: [
            {
              host: env.TYPESENSE_HOST,
              port: env.TYPESENSE_PORT,
              protocol: env.TYPESENSE_PROTOCOL,
            },
          ],
          apiKey: env.TYPESENSE_API_KEY,
          connectionTimeoutSeconds: 2,
        });
      },
    },
  ],
  exports: [TYPESENSE_CLIENT],
})
export class TypesenseModule {}
