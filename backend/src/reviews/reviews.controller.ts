import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReviewDocument } from './schemas/reviews.schemas';
import { ReviewsService } from './reviews.service';
import { ReviewComparison } from './review-comparison.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';

interface CreateReviewBody {
  pullRequestUrl: string;
}

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  findAll(@Req() request: AuthenticatedRequest): Promise<ReviewDocument[]> {
    return this.reviewsService.findAll(request.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest): Promise<ReviewDocument> {
    return this.reviewsService.findOne(id, request.user.id);
  }

  @Get(':id/compare/:otherId')
  compare(
    @Param('id') id: string,
    @Param('otherId') otherId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReviewComparison> {
    return this.reviewsService.compare(id, otherId, request.user.id);
  }

  @Post()
  createReview(@Body() body: CreateReviewBody, @Req() request: AuthenticatedRequest): Promise<ReviewDocument> {
    const pullRequestUrl = body?.pullRequestUrl?.trim();

    if (!pullRequestUrl) {
      throw new BadRequestException('pullRequestUrl is required');
    }

    return this.reviewsService.createReview(pullRequestUrl, request.user.id);
  }
}
