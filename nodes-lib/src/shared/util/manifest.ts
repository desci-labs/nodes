/**
 * Best-effort way of ensuring reasonable representations of absolute paths
 * gets wrangled into the `root/`-prefixed string the API's/manifest expect.
 */

export const makeAbsolutePath = (path: string) => {
  // Sensible definitions of root
  const ROOT_ALIASES = ["root", "root/", "/"];
  if (!path || ROOT_ALIASES.includes(path)) return "root";

  // Support unix-style absolute paths
  if (path.startsWith("/")) return `root${path}`;

  // What endpoints actually expect
  if (path.startsWith("root/")) return path;

  // Just add root to other paths
  return `root/${path}`;
};
