/** Normalize /jobs index — plain array or { jobs, meta } paginated payload. */
export function normalizeJobsListResponse(data) {
  if (Array.isArray(data)) {
    return {
      jobs: data,
      meta: null,
    };
  }
  if (data && Array.isArray(data.jobs)) {
    return {
      jobs: data.jobs,
      meta: data.meta || null,
    };
  }
  return { jobs: [], meta: null };
}
