import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type GithubConnectStateDocument = HydratedDocument<GithubConnectState>;

@Schema({ timestamps: true })
export class GithubConnectState {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true })
  stateHash!: string;

  @Prop({ type: Date, required: true, expires: 0 })
  expiresAt!: Date;
}

export const GithubConnectStateSchema = SchemaFactory.createForClass(GithubConnectState);
