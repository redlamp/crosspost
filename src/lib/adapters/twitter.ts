import { xWeightedLength } from "@/lib/text";

import type { PlatformAdapter } from "./types";

export const twitter: PlatformAdapter = {
  id: "twitter",
  name: "Twitter",
  limit: 280,
  count: xWeightedLength,
  chain: true,
  countNote: "Links count as 23; CJK and emoji as 2",
  // Shown as Twitter with the classic bird, by choice. The API and intent URL are X's.
  brand: {
    color: "#1DA1F2",
    iconPath:
      "M21.543 7.104c.015.211.015.423.015.636 0 6.507-4.954 14.01-14.01 14.01v-.003A13.94 13.94 0 0 1 0 19.539a9.88 9.88 0 0 0 7.287-2.041 4.93 4.93 0 0 1-4.6-3.42 4.916 4.916 0 0 0 2.223-.084A4.926 4.926 0 0 1 .96 9.167v-.062a4.887 4.887 0 0 0 2.235.616A4.928 4.928 0 0 1 1.67 3.148 13.98 13.98 0 0 0 11.82 8.292a4.929 4.929 0 0 1 8.39-4.49 9.868 9.868 0 0 0 3.128-1.196 4.941 4.941 0 0 1-2.165 2.724A9.828 9.828 0 0 0 24 4.555a10.019 10.019 0 0 1-2.457 2.549z",
  },
  open: {
    label: "Open prefilled",
    url: (firstChunk) => `https://x.com/intent/post?text=${encodeURIComponent(firstChunk)}`,
  },
};
