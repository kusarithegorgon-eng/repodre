import type { ImgHTMLAttributes } from "react";

/**
 * Repodre brand logo — the "R" lettermark artwork used across the app header,
 * legal pages, and the browser favicon.
 */
export function RepodreLogo(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/image.png" alt="Repodre" {...props} />;
}
