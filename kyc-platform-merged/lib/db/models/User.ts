import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISubscription {
  status: 'active' | 'expired' | 'cancelled' | 'none';
  plan: 'free' | 'monthly' | 'annual';
  started_at: Date | null;
  expires_at: Date | null;
  payment_ref: string | null;
  /** Stripe subscription ID (sub_xxx) for webhook correlation */
  stripe_subscription_id: string | null;
}

export interface IUser extends Document {
  name: string;
  email: string;
  mobile: string | null;
  password_hash: string | null;
  auth_methods: ('email' | 'google')[];
  role: 'reader' | 'premium' | 'editor' | 'admin';
  /** Stripe customer ID (cus_xxx) — set on first checkout */
  stripe_customer_id: string | null;
  subscription: ISubscription;
  created_at: Date;
  updated_at: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    status:                 { type: String, enum: ['active', 'expired', 'cancelled', 'none'], default: 'none' },
    plan:                   { type: String, enum: ['free', 'monthly', 'annual'], default: 'free' },
    started_at:             { type: Date, default: null },
    expires_at:             { type: Date, default: null },
    payment_ref:            { type: String, default: null },
    stripe_subscription_id: { type: String, default: null },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    name:               { type: String, required: true },
    email:              { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobile:             { type: String, default: null },
    password_hash:      { type: String, default: null },
    auth_methods:       [{ type: String, enum: ['email', 'google'] }],
    role:               { type: String, enum: ['reader', 'premium', 'editor', 'admin'], default: 'reader' },
    stripe_customer_id: { type: String, default: null },
    subscription:       { type: SubscriptionSchema, default: () => ({}) },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ mobile: 1 }, { sparse: true });
UserSchema.index({ role: 1 });
UserSchema.index({ stripe_customer_id: 1 }, { sparse: true });
UserSchema.index({ 'subscription.stripe_subscription_id': 1 }, { sparse: true });
UserSchema.index({ 'subscription.status': 1, 'subscription.expires_at': 1 });

export const UserModel: Model<IUser> =
  (mongoose.models?.User as Model<IUser>) ?? mongoose.model<IUser>('User', UserSchema);
