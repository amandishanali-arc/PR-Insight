import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { GithubAppController } from './github-app.controller';
import { GithubAppService } from './github-app.service';
import { GithubConnection, GithubConnectionSchema } from './schemas/github-connection.schema';
import { GithubConnectState, GithubConnectStateSchema } from './schemas/github-connect-state.schema';

@Module({
  imports: [
    HttpModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: GithubConnection.name, schema: GithubConnectionSchema },
      { name: GithubConnectState.name, schema: GithubConnectStateSchema },
    ]),
  ],
  controllers: [GithubAppController],
  providers: [GithubAppService],
  exports: [GithubAppService],
})
export class GithubAppModule {}
