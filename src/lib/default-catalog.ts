/**
 * Catalog defaults are initialized by database migrations, never by page loads.
 *
 * This no-op remains for compatibility with existing imports. Browser-side
 * seeding can resurrect stale catalog data after users intentionally reset it.
 */
export async function ensureDefaultCatalog(): Promise<void> {
  // Intentionally empty.
}
