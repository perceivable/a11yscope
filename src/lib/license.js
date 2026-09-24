/**
 * Pro entitlement.
 *
 * Deliberately a single narrow module so that wiring a real payment provider
 * later touches one file. Until then `isPro()` reads a local flag, which means
 * the paid surface can be built and tested before any billing account exists.
 *
 * Note for future work: whatever provider replaces this must not require a
 * server of our own — a recurring hosting bill is not something this project
 * can take on.
 */

const STORAGE_KEY = "a11yscope:entitlement";

export async function isPro() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY]?.plan === "pro";
  } catch {
    return false;
  }
}

export async function setPro(enabled) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: { plan: enabled ? "pro" : "free", updatedAt: new Date().toISOString() },
  });
}

/** What the free tier gets. Kept here so the split is visible in one place. */
export const FREE_TIER = {
  scanCurrentPage: true,
  highlightElements: true,
  seeEveryFinding: true, // never cripple the core check — that kills reviews
  exportReport: false,
  batchScan: false,
  complianceDocument: false,
};
