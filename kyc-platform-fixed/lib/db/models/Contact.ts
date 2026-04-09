import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IContact extends Document {
  name: string;
  email: string;
  subject: string;
  message: string;
  submitted_at: Date;
  status: 'new' | 'read' | 'resolved';
  ref: string;
}

const ContactSchema = new Schema<IContact>(
  {
    name:         { type: String, required: true },
    email:        { type: String, required: true },
    subject:      { type: String, required: true },
    message:      { type: String, required: true },
    submitted_at: { type: Date, default: Date.now },
    status:       { type: String, enum: ['new', 'read', 'resolved'], default: 'new' },
    ref:          { type: String, required: true, unique: true },
  },
  { timestamps: false }
);

ContactSchema.index({ submitted_at: -1 });
ContactSchema.index({ status: 1 });

export const ContactModel: Model<IContact> =
  (mongoose.models?.Contact as Model<IContact>) ?? mongoose.model<IContact>('Contact', ContactSchema);
