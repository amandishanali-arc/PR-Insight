import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ timestamps: true })
export class Review {
  @Prop({ required: true })
  pullRequestUrl!: string;

  @Prop()
  repositoryOwner!: string;

  @Prop()
  repositoryName!: string;

  @Prop()
  pullRequestNumber!: number;

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
}

export const ReviewSchema =
  SchemaFactory.createForClass(Review);