import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GithubModule } from './github/github.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { GithubAppModule } from './github-app/github-app.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MongoDB_URI'),
        dbName: 'pr-insight',
      }),
    }),
    GithubModule,
    ReviewsModule,
    AiModule,
    AuthModule,
    GithubAppModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
