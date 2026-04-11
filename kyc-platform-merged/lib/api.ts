import { contactsAdapter, postsAdapter, usersAdapter } from '@/lib/adapters';

export async function getPosts() { return postsAdapter.listPublished(); }
export async function getAllPosts() { return postsAdapter.listAll(); }
export async function getPost(slug: string) { return postsAdapter.getBySlug(slug); }
export async function searchPosts(query: string) { return postsAdapter.search(query); }
export async function getUsers() { return usersAdapter.list(); }
export async function getContacts() { return contactsAdapter.list(); }
