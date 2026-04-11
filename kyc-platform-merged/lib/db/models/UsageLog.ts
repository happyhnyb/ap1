import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUsageLog extends Document {
  user_id: string;
  feature: 'ai_search' | 'predictor' | 'export';
  query: string | null;
  params: Record<string, unknown>;
  timestamp: Date;
  response_summary: string | null;
}

const UsageLogSchema = new Schema<IUsageLog>(
  {
    user_id:          { type: String, required: true },
    feature:          { type: String, enum: ['ai_search', 'predictor', 'export'], required: true },
    query:            { type: String, default: null },
    params:           { type: Schema.Types.Mixed, default: {} },
    timestamp:        { type: Date, default: Date.now },
    response_summary: { type: String, default: null },
  },
  { timestamps: false }
);

UsageLogSchema.index({ user_id: 1, timestamp: -1 });
UsageLogSchema.index({ feature: 1, timestamp: -1 });
// TTL: auto-delete logs after 90 days
UsageLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const UsageLogModel: Model<IUsageLog> =
  (mongoose.models?.UsageLog as Model<IUsageLog>) ?? mongoose.model<IUsageLog>('UsageLog', UsageLogSchema);
