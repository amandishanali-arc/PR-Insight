import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/reviews.schemas';
import { GithubService } from '../github/github.service';
import { AiService } from '../ai/ai.service';
import { ReviewScoreService } from './review-score.service';
import {
  ReviewComparison,
  ReviewComparisonService,
} from './review-comparison.service';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class ReviewsService implements OnModuleInit {
  private readonly logger = new Logger(ReviewsService.name);
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    private readonly githubService: GithubService,
    @Inject(AiService)
    private readonly aiService: AiService,
    @Inject(ReviewScoreService)
    private readonly reviewScoreService: ReviewScoreService,
    @Inject(ReviewComparisonService)
    private readonly reviewComparisonService: ReviewComparisonService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reviewModel.createIndexes();
    const indexes = await this.reviewModel.collection.indexes();
    const legacyIndex = indexes.find((index) => {
      const keys = Object.keys(index.key);
      return index.unique === true &&
        keys.length === 4 &&
        keys.join('|') === 'repositoryOwner|repositoryName|pullRequestNumber|headSha';
    });

    if (legacyIndex?.name) {
      await this.reviewModel.collection.dropIndex(legacyIndex.name);
      this.logger.log(`Removed legacy cross-user review index ${legacyIndex.name}`);
    }
  }

  async findAll(userId: string): Promise<ReviewDocument[]> {
    return this.reviewModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string, userId: string): Promise<ReviewDocument> {
    if (!isValidObjectId(id) || !isValidObjectId(userId)) {
      throw new NotFoundException('Review not found');
    }

    const review = await this.reviewModel.findOne({ _id: id, userId: new Types.ObjectId(userId) }).exec();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }

  async compare(id: string, otherId: string, userId: string): Promise<ReviewComparison> {
    const [baseReview, targetReview] = await Promise.all([
      this.findOne(id, userId),
      this.findOne(otherId, userId),
    ]);

    const samePullRequest =
      baseReview.repositoryOwner === targetReview.repositoryOwner &&
      baseReview.repositoryName === targetReview.repositoryName &&
      baseReview.pullRequestNumber === targetReview.pullRequestNumber;

    if (!samePullRequest) {
      throw new BadRequestException(
        'Reviews must belong to the same pull request.',
      );
    }

    return this.reviewComparisonService.compare(baseReview, targetReview);
  }

  async createReview(pullRequestUrl: string, userId: string) {
    // 1. Get PR information and changed files
    const githubData =
      await this.githubService.getPullRequestDetails(pullRequestUrl, userId);

    if (!githubData.headSha) {
      throw new BadGatewayException(
        'GitHub did not return the pull request head commit SHA',
      );
    }

    const pullRequestIdentity = {
      userId: new Types.ObjectId(userId),
      repositoryOwner: githubData.repositoryOwner,
      repositoryName: githubData.repositoryName,
      pullRequestNumber: githubData.pullRequestNumber,
    };

    const cachedReview = await this.reviewModel
      .findOne({
        ...pullRequestIdentity,
        headSha: githubData.headSha,
        status: 'completed',
      })
      .exec();

    if (cachedReview) {
      return cachedReview;
    }

    const latestVersion = await this.reviewModel
      .findOne(pullRequestIdentity)
      .sort({ version: -1 })
      .select({ version: 1 })
      .lean()
      .exec();
    const version = (latestVersion?.version ?? 0) + 1;

    // 2. Analyze changed files with AI
    const aiReview = await this.aiService.reviewFiles(githubData.files);
    const reviewScore = this.reviewScoreService.calculateReviewScore(
      aiReview.findings,
    );

    // 3. Save final review
    const review = new this.reviewModel({
      pullRequestUrl,
      userId: new Types.ObjectId(userId),

      repositoryOwner: githubData.repositoryOwner,
      repositoryName: githubData.repositoryName,
      pullRequestNumber: githubData.pullRequestNumber,
      headSha: githubData.headSha,
      version,

      title: githubData.title,
      author: githubData.author,
      state: githubData.state,

      filesChanged: githubData.filesChanged,
      additions: githubData.additions,
      deletions: githubData.deletions,

      summary: aiReview.summary,
      findings: aiReview.findings,
      score: reviewScore.score,
      severityCounts: reviewScore.severityCounts,
      analysisMetadata: aiReview.analysisMetadata,

      status: 'completed',
    });

    try {
      return await review.save();
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        const concurrentlySavedReview = await this.reviewModel
          .findOne({
            ...pullRequestIdentity,
            headSha: githubData.headSha,
            status: 'completed',
          })
          .exec();

        if (concurrentlySavedReview) {
          return concurrentlySavedReview;
        }
      }

      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
