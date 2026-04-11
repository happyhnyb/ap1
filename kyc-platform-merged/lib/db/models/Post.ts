import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPost extends Document {
  type: 'SHORT' | 'STORY' | 'ARTICLE';
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  tags: string[];
  category: string;
  author: string;
  author_id: string;
  hero_image: string | null;
  inline_images: string[];
  is_premium: boolean;
  linked_article_id: string | null;  // for STORY → ARTICLE deep-dive link
  status: 'draft' | 'published' | 'archived';
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  view_count: number;
  img: string;
  // Atlas Search friendly text field
  search_text: string;
}

const PostSchema = new Schema<IPost>(
  {
    type: { type: String, enum: ['SHORT', 'STORY', 'ARTICLE'], required: true },
    title: { type: String, required: true, maxlength: 300 },
    slug: { type: String, required: true, unique: true },
    excerpt: { type: String, required: true, maxlength: 500 },
    body: { type: String, required: true },
    tags: [{ type: String }],
    category: { type: String, required: true },
    author: { type: String, required: true },
    author_id: { type: String, required: true },
    hero_image: { type: String, default: null },
    inline_images: [{ type: String }],
    is_premium: { type: Boolean, default: false },
    linked_article_id: { type: String, default: null },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    published_at: { type: Date, default: null },
    view_count: { type: Number, default: 0 },
    img: { type: String, default: 'crops' },
    search_text: { type: String, default: '' },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Indexes for common queries
PostSchema.index({ slug: 1 }, { unique: true });
PostSchema.index({ status: 1, published_at: -1 });
PostSchema.index({ type: 1, status: 1 });
PostSchema.index({ tags: 1 });
PostSchema.index({ is_premium: 1, status: 1 });
// Full-text search index (used when Atlas Search is not available)
PostSchema.index({ title: 'text', excerpt: 'text', body: 'text', tags: 'text' });

// Pre-save: build search_text for Atlas Search indexing
PostSchema.pre<IPost>('save', function () {
  this.search_text = [this.title, this.excerpt, this.body, (this.tags || []).join(' '), this.category, this.author].join(' ');
});

export const PostModel: Model<IPost> =
  (mongoose.models?.Post as Model<IPost>) ?? mongoose.model<IPost>('Post', PostSchema);
