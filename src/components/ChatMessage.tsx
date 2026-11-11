import type { ReactNode } from "react";
import type { ChatResponse } from "@/lib/types";

export type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  // Only on bot replies that came back from /api/chat.
  response?: ChatResponse;
  withDisclaimer?: boolean;
};

const DISCLAIMER =
  "This assistant shares general information from PlacidWay pages. It is not medical advice; please discuss any treatment with your doctor.";

type Props = {
  message: Message;
  // Rendered under the bubble (used for the lead form).
  children?: ReactNode;
};

export function ChatMessage({ message, children }: Props) {
  const sources = message.response?.sources ?? [];
  const quoteUrl = message.response?.quoteUrl;

  return (
    <div className={`msg ${message.role}`}>
      <div className="bubble">
        {message.content}

        {sources.length > 0 && (
          <div className="sources">
            <span>{sources.length > 1 ? "Sources:" : "Source:"}</span>
            {sources.map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
            ))}
          </div>
        )}

        {quoteUrl && (
          <a className="quote" href={quoteUrl} target="_blank" rel="noreferrer">
            Request a free quote from PlacidWay →
          </a>
        )}

        {message.withDisclaimer && <p className="disclaimer">{DISCLAIMER}</p>}
      </div>
      {children}
    </div>
  );
}
