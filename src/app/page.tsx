import { Chat } from "@/components/Chat";
import { knowledgeBase } from "@/lib/retrieval/knowledge";

export default function HomePage() {
  const lastUpdated = new Date(knowledgeBase.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <main className="shell">
      <header className="header">
        <h1>PlacidWay Assistant</h1>
        <p>
          Questions about ITC Immunity Therapy Center (Tijuana): treatments, packages and prices.
        </p>
      </header>

      <Chat />

      <footer className="footer">
        Answers come only from {knowledgeBase.pages.length} PlacidWay pages · content updated{" "}
        {lastUpdated}
      </footer>
    </main>
  );
}
