/**
 * Get the base URL for API calls.
 * For static exports (Android), this should point to the Vercel deployment URL.
 * For Vercel deployments, this will be empty string to use relative paths.
 * NEXT_PUBLIC_API_URL is embedded at build time, so set it when building for static export.
 */
export function getApiBaseUrl() {
  // NEXT_PUBLIC_* vars are embedded at build time
  // Set NEXT_PUBLIC_API_URL when building static export (e.g., "https://your-app.vercel.app")
  // Leave it unset for Vercel deployments (uses relative paths)
  return process.env.NEXT_PUBLIC_API_URL || '';
}

/**
 * Helper to build a full API URL
 */
export function getApiUrl(path) {
  const baseUrl = getApiBaseUrl();
  // Ensure path starts with / and baseUrl doesn't end with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!baseUrl) {
    return cleanPath;
  }
  // Remove trailing slash from baseUrl if present
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBaseUrl}${cleanPath}`;
}
