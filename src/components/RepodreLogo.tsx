import type { ImgHTMLAttributes } from "react";

/**
 * Repodre brand logo — the "R" lettermark artwork used across the app header,
 * legal pages, and the browser favicon.
 */
export function RepodreLogo(props: ImgHTMLAttributes<HTMLImageElement>) {
  const { style, width, height, ...rest } = props;
  const defaultWidth = width ?? 48;
  const defaultHeight = height ?? undefined;

  return (
    <img
      src="/image.png"
      alt="Repodre"
      width={defaultWidth}
      height={defaultHeight}
      style={{ height: defaultHeight ? defaultHeight : "auto", maxWidth: "100%", ...style }}
      {...rest}
    />
  );
}
