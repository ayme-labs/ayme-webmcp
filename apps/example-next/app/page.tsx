import ClientExample from "./client-example";

// This remains a Server Component. Only the Ayme example skips prerendering.
export default function Home() {
  return (
    <main>
      <h1>Ayme Next.js prototype</h1>
      <p>One Page Object, compiled by Turbopack and used in the browser.</p>
      <ClientExample />
    </main>
  );
}
