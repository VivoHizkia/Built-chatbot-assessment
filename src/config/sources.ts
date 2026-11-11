export type PageType =
  "clinic_profile" | "treatment_package" | "clinic_videos" | "price_list" | "price_comparison";

export type Source = { id: string; type: PageType; url: string };

const BASE = "https://www.placidway.com";

// The seven pages shared in the assessment brief, in the same order.
// The crawler fetches exactly these and never follows links.
export const SOURCES: Source[] = [
  {
    id: "p1",
    type: "clinic_profile",
    url: `${BASE}/profile/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center`,
  },
  {
    id: "p2",
    type: "treatment_package",
    url: `${BASE}/package/7903/Alternative-Adenocarcinoma-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC`,
  },
  {
    id: "p3",
    type: "treatment_package",
    url: `${BASE}/package/7902/Alternative-Adrenal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC`,
  },
  {
    id: "p4",
    type: "treatment_package",
    url: `${BASE}/package/7901/Alternative-Anal-Cancer-Treatment-Package-in-Tijuana-Mexico-by-ITC`,
  },
  {
    id: "p5",
    type: "clinic_videos",
    url: `${BASE}/profile-videos/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center`,
  },
  {
    id: "p6",
    type: "price_list",
    url: `${BASE}/price-list/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center`,
  },
  {
    id: "p7",
    type: "price_comparison",
    url: `${BASE}/search-medical-pricings/Alternative-Medicine/All/1`,
  },
];

export const ALLOWED_URLS = new Set(SOURCES.map((source) => source.url));

// Shown with "I don't know" and booking answers. Can be overridden with QUOTE_URL.
export const DEFAULT_QUOTE_URL = `${BASE}/RFI/5/Alternative-Cancer-Treatment-by-ITC-Immunity-Therapy-Center`;

// robots.txt groups are matched against the short token; the full string is sent as the header.
export const CRAWLER_NAME = "PlacidWayKnowledgeBot";
export const CRAWLER_USER_AGENT = `${CRAWLER_NAME}/1.0 (+assessment crawler; fetches 7 shared pages only)`;
