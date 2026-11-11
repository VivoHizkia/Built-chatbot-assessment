import { describe, expect, it } from "vitest";
import { extractPage } from "@/lib/ingestion/extract";
import { chunkPage } from "@/lib/ingestion/chunk";
import type { Source } from "@/config/sources";

const source: Source = {
  id: "p9",
  type: "treatment_package",
  url: "https://www.placidway.com/package/1/Test",
};

const html = `<html><head><title>Ignored title</title><script>var x = 1</script></head><body>
<h1>Test Cancer Package by ITC</h1>
<div class="pack-price-block col-sm-4"><h2>Package Price</h2><span>Medical Center Reviews</span><span>$18,995</span><span>Price starting from</span></div>
<main class="article-dt-desc">
  <div class="request-vido-popup-main"><h3>Request a video call</h3><p>Popup text</p></div>
  <div class="pack-inner-content">
    <section class="table-of-contents"><ul><li>Profile</li><li>Details</li></ul></section>
    <h2>Cost of Treatment</h2>
    <p>Programs run for three weeks.</p>
    <table><tr><th>Program Type</th><th>Duration</th><th>Total Cost (USD)</th><th>Actions</th></tr>
      <tr><td>Out-Patient Program</td><td>3 Weeks</td><td>$18,995</td><td>Chat with Center</td></tr>
      <tr><td>In-Patient Program</td><td>3 Weeks</td><td>$30,000</td><td>Chat with Center</td></tr></table>
    <h2>Optional Procedures</h2>
    <ul><li><strong>Ethanol Tumor Ablation:</strong> $3,800 - $4,250 USD</li></ul>
    <p>Read More</p>
  </div>
</main>
<div class="related"><h2>Unlock the Best Packages</h2><p>Dental implants in Cairo $500</p></div>
</body></html>`;

describe("extractPage", () => {
  const page = extractPage(html, source);

  it("uses the h1 as title and keeps the header price", () => {
    expect(page.title).toBe("Test Cancer Package by ITC");
    expect(page.headerPrice).toBe("Price starting from $18,995 (USD)");
  });

  it("keeps only main content, without popups, table of contents or related cards", () => {
    const all = page.sections.flatMap((s) => [s.heading, ...s.lines]).join("\n");
    expect(all).not.toContain("Popup text");
    expect(all).not.toContain("Profile");
    expect(all).not.toContain("Cairo");
    expect(all).not.toContain("Read More");
  });

  it("turns tables into labelled rows and drops action columns", () => {
    const cost = page.sections.find((s) => s.heading === "Cost of Treatment")!;
    expect(cost.lines).toContain(
      "- Program Type: In-Patient Program; Duration: 3 Weeks; Total Cost (USD): $30,000",
    );
    expect(cost.lines.join(" ")).not.toContain("Chat with Center");
  });

  it("keeps a label and its value on one line", () => {
    const optional = page.sections.find((s) => s.heading === "Optional Procedures")!;
    expect(optional.lines).toContain("- Ethanol Tumor Ablation: $3,800 - $4,250 USD");
  });

  it("chunks with stable ids and the section heading attached", () => {
    const chunks = chunkPage(page);
    expect(chunks[0].id).toBe("p9-c1");
    expect(chunks[0].text).toContain("Price starting from $18,995");
    expect(chunks.every((c) => c.url === source.url)).toBe(true);
  });
});
