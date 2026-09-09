import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type GithubConnectionDocument = HydratedDocument<GithubConnection>;

@Schema({ timestamps: true })
export class GithubConnection {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Number, required: true })
  installationId!: number;

  @Prop({ type: String, required: true })
  accountLogin!: string;

  @Prop({ type: String, required: true })
  accountType!: string;
}

export const GithubConnectionSchema = SchemaFactory.createForClass(GithubConnection);
GithubConnectionSchema.index({ userId: 1, installationId: 1 }, { unique: true });
