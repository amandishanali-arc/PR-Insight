import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ _id: false })
export class ReviewFinding {
  @Prop({ type: String, required: true })
  file!: string;

  @Prop({ type: String, required: true })
  category!: string;

  @Prop({ type: String, required: true })
  severity!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  description!: string;

  @Prop({ type: String, required: true })
  suggestion!: string;
}

export const ReviewFindingSchema = SchemaFactory.createForClass(ReviewFinding);

@Schema({ _id: false })
export class ReviewSeverityCounts {
  @Prop({ type: Number, default: 0, min: 0 })
  critical!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  high!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  medium!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  low!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  info!: number;
}

export const ReviewSeverityCountsSchema =
  SchemaFactory.createForClass(ReviewSeverityCounts);

@Schema({ _id: false })
export class ReviewAnalysisMetadata {
  @Prop({ type: Number, required: true, min: 0 })
  totalFiles!: number;

  @Prop({ type: Number, required: true, min: 0 })
  reviewedFiles!: number;

  @Prop({ type: Number, required: true, min: 0 })
  skippedFiles!: number;

  @Prop({ type: Number, required: true, min: 0 })
  chunksProcessed!: number;

  @Prop({ type: Number, required: true, min: 0 })
  chunksFailed!: number;

  @Prop({ type: Boolean, required: true, default: false })
  partialAnalysis!: boolean;
}

export const ReviewAnalysisMetadataSchema =
  SchemaFactory.createForClass(ReviewAnalysisMetadata);

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: User.name })
  userId?: Types.ObjectId;

  @Prop({ required: true })
  pullRequestUrl!: string;

  @Prop()
  repositoryOwner!: string;

  @Prop()
  repositoryName!: string;

  @Prop()
  pullRequestNumber!: number;

  @Prop({ type: String })
  headSha?: string;

  @Prop({ type: Number, min: 1 })
  version?: number;

  @Prop()
  title!: string;

  @Prop()
  author!: string;

  @Prop()
  state!: string;

  @Prop()
  filesChanged!: number;

  @Prop()
  additions!: number;

  @Prop()
  deletions!: number;

  @Prop({ default: 'fetched' })
  status!: string;

  @Prop({ type: String, required: true })
  summary!: string;

  @Prop({ type: [ReviewFindingSchema], default: [] })
  findings!: ReviewFinding[];

  @Prop({ type: Number, min: 0, max: 100 })
  score?: number;

  @Prop({ type: ReviewSeverityCountsSchema })
  severityCounts?: ReviewSeverityCounts;

  @Prop({ type: ReviewAnalysisMetadataSchema })
  analysisMetadata?: ReviewAnalysisMetadata;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

ReviewSchema.index(
  {
    userId: 1,
    repositoryOwner: 1,
    repositoryName: 1,
    pullRequestNumber: 1,
    headSha: 1,
  },
  {
    unique: true,
    name: 'user_pr_head_unique',
    partialFilterExpression: {
      userId: { $type: 'objectId' },
      headSha: { $type: 'string' },
    },
  },
);
