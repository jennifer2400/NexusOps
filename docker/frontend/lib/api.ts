const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'API request failed');
  }

  return response.json();
}

export const NexusOpsAPI = {
  health: () => apiRequest('/health'),
  stats: () => apiRequest('/stats'),
  containers: () => apiRequest('/containers'),
  images: () => apiRequest('/images'),
  stacks: () => apiRequest('/stacks'),
};
