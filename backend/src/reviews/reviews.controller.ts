import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ReviewDocument } from './schemas/reviews.schemas';
import { ReviewsService } from './reviews.service';

interface CreateReviewBody {
  pullRequestUrl: string;
}

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  createReview(@Body() body: CreateReviewBody): Promise<ReviewDocument> {
    const pullRequestUrl = body?.pullRequestUrl?.trim();

    if (!pullRequestUrl) {
      throw new BadRequestException('pullRequestUrl is required');
    }

    return this.reviewsService.createReview(pullRequestUrl);
  }
}
