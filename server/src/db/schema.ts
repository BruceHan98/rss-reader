import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const feeds = sqliteTable('feeds', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  url: text('url').notNull().unique(),
  siteUrl: text('site_url'),
  favicon: text('favicon'),
  groupId: text('group_id').references(() => groups.id, { onDelete: 'set null' }),
  lastFetchedAt: text('last_fetched_at'),
  fetchInterval: integer('fetch_interval').notNull().default(60),
  errorCount: integer('error_count').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),
  feedId: text('feed_id').notNull().references(() => feeds.id, { onDelete: 'cascade' }),
  guid: text('guid').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  content: text('content'),
  author: text('author'),
  url: text('url'),
  publishedAt: text('published_at'),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
  isReadLater: integer('is_read_later', { mode: 'boolean' }).notNull().default(false),
  aiScore: integer('ai_score'),
  aiTags: text('ai_tags'),
  createdAt: text('created_at').notNull(),
});

export const settings = sqliteTable('settings', {
  userId: text('user_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
});

export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type User = typeof users.$inferSelect;
