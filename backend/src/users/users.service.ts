import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  create(name: string, email: string, passwordHash: string): Promise<UserDocument> {
    return new this.userModel({ name: name.trim(), email: this.normalizeEmail(email), passwordHash }).save();
  }

  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: this.normalizeEmail(email) }).select('+passwordHash').exec();
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: this.normalizeEmail(email) }).exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
