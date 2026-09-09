import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { Review, ReviewSchema } from './schemas/reviews.schemas';
import { GithubModule } from '../github/github.module';
import { AiModule } from '../ai/ai.module';
import { ReviewScoreService } from './review-score.service';
import { ReviewComparisonService } from './review-comparison.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Review.name,
        schema: ReviewSchema,
      },
    ]),
    GithubModule,
    AiModule,
    AuthModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewScoreService, ReviewComparisonService],
})
export class ReviewsModule {}
