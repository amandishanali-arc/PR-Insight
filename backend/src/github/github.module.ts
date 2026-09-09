import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { GithubAppModule } from '../github-app/github-app.module';

@Module({
  imports: [HttpModule, GithubAppModule],
  controllers: [GithubController],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
