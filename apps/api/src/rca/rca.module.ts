import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OpenAiRcaProvider } from './openai-rca.provider';
import { RcaController } from './rca.controller';
import { RCA_PROVIDER } from './rca-provider';
import { RcaService } from './rca.service';

@Module({
  imports: [AuthModule],
  controllers: [RcaController],
  providers: [
    RcaService,
    OpenAiRcaProvider,
    { provide: RCA_PROVIDER, useExisting: OpenAiRcaProvider },
  ],
})
export class RcaModule {}
