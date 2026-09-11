"use client";

import dynamic from "next/dynamic";

// "use client" alone still allows server prerendering. createPage() needs
// window during provider construction, so keep the whole Ayme subtree client-only.
const ClientExample = dynamic(() => import("./counter-example"), {
  ssr: false,
  loading: () => <p>Loading browser example...</p>,
});

export default ClientExample;
