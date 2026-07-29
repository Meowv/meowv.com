import type { Metadata } from "next";

const SITE_NAME = "字帖生成";

type PageMetadataOptions = {
  title: string;
  description: string;
  canonical: `/${string}/`;
};

export function createPageMetadata({
  title,
  description,
  canonical,
}: PageMetadataOptions): Metadata {
  const brandedTitle = `${title}｜${SITE_NAME}`;

  return {
    title: brandedTitle,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: SITE_NAME,
      url: canonical,
      title: brandedTitle,
      description,
    },
    twitter: {
      card: "summary",
      title: brandedTitle,
      description,
    },
  };
}
