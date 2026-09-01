import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Review,
  ReviewDocument,
} from './schemas/reviews.schemas';
import { GithubService } from '../github/github.service';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    private readonly githubService: GithubService,
  ) {}

  async createReview(pullRequestUrl: string) {
    const githubData =
      await this.githubService.getPullRequestDetails(
        pullRequestUrl,
      );

    const review = new this.reviewModel({
      pullRequestUrl,
      ...githubData,
      status: 'fetched',
    });

    return await review.save();
  }
}