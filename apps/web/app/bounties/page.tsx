import { AuroraBackground } from "@/components/aurora-bg";
import { Header } from "@/components/header";
import { BountiesFeed } from "@/components/bounties-feed";

export default function BountiesPage() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden">
      <AuroraBackground />
      <Header />
      <BountiesFeed />
    </main>
  );
}
