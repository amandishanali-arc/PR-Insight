import type { Review, ReviewComparison } from '../types/review'
import { apiRequest } from './apiClient'

export async function createReview(pullRequestUrl: string): Promise<Review> {
  return apiRequest<Review>('/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pullRequestUrl }),
  })
}

export function getReviews(): Promise<Review[]> {
  return apiRequest<Review[]>('/reviews')
}

export function getReviewById(id: string): Promise<Review> {
  return apiRequest<Review>(`/reviews/${encodeURIComponent(id)}`)
}

export function compareReviews(
  baseId: string,
  targetId: string,
): Promise<ReviewComparison> {
  return apiRequest<ReviewComparison>(
    `/reviews/${encodeURIComponent(baseId)}/compare/${encodeURIComponent(targetId)}`,
  )
}
