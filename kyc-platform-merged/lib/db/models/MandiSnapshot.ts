import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Persistent daily mandi snapshot stored in MongoDB.
 *
 * One document per IST calendar date.  The records array holds the raw
 * MandiRecord objects fetched from Agmarknet for that day.
 *
 * Indexed on `date` (unique) so upserts are idempotent and range queries
 * (last N days) are fast.
 */

export interface IMandiSnapshot extends Document {
  /** IST calendar date — YYYY-MM-DD */
  date:        string;
  /** ISO timestamp of when data was last fetched */
  fetchedAt:   string;
  /** Raw records from Agmarknet for this date */
  records:     Record<string, unknown>[];
  recordCount: number;
  /** How many records came from the real API vs synthetic backfill */
  realCount:   number;
  source:      'agmarknet' | 'synthetic';
}

const MandiSnapshotSchema = new Schema<IMandiSnapshot>(
  {
    date:        { type: String, required: true, unique: true },
    fetchedAt:   { type: String, required: true },
    records:     { type: Schema.Types.Mixed, default: [] },
    recordCount: { type: Number, default: 0 },
    realCount:   { type: Number, default: 0 },
    source:      { type: String, enum: ['agmarknet', 'synthetic'], default: 'agmarknet' },
  },
  {
    timestamps: true,
    collection: 'mandi_snapshots',
  },
);

// Primary query pattern: recent N days sorted descending
MandiSnapshotSchema.index({ date: -1 });

const MandiSnapshotModel: Model<IMandiSnapshot> =
  (mongoose.models.MandiSnapshot as Model<IMandiSnapshot>) ||
  mongoose.model<IMandiSnapshot>('MandiSnapshot', MandiSnapshotSchema);

export default MandiSnapshotModel;
