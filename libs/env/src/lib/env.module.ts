import { DynamicModule, Global, Module } from '@nestjs/common';
import { apiSchema, validateEnv } from './env.validation';
import z from 'zod';

export const ENV_SERVICE = Symbol('ENV_SERVICE');

export type EnvService = z.infer<typeof apiSchema>;

@Global()
@Module({})
export class EnvModule {
  static forRoot(schema: z.ZodType): DynamicModule {
    return {
      module: EnvModule,
      providers: [
        {
          provide: ENV_SERVICE,
          useFactory: () => {
            return validateEnv(schema);
          },
        },
      ],
      exports: [ENV_SERVICE],
    };
  }
}
