"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatResponse, ChatTurn } from "@/lib/types";
import { ChatMessage, type Message } from "./ChatMessage";
import { LeadForm } from "./LeadForm";

const WELCOME: Message = {
  id: 0,
  role: "assistant",
  content:
    "Hi! I can answer questions about ITC Immunity Therapy Center in Tijuana: packages, prices and what is included. What would you like to know?",
};

const SUGGESTIONS = [
  "How much does the adrenal cancer package cost?",
  "What is included in the in-patient program?",
  "How long is the treatment program?",
  "¿Cuánto cuesta el tratamiento de cáncer anal?",
];

const MAX_QUESTION_CHARS = 500;

async function askBot(question: string, history: ChatTurn[]): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
  const data = (await res.json()) as ChatResponse & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [disclaimerShown, setDisclaimerShown] = useState(false);
  // Id of the message that currently has the lead form under it.
  const [leadFormFor, setLeadFormFor] = useState<number | null>(null);
  const [leadSent, setLeadSent] = useState(false);

  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const addMessage = (message: Omit<Message, "id">): number => {
    const id = nextId.current++;
    setMessages((previous) => [...previous, { ...message, id }]);
    return id;
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;

    // The welcome line is ours, not part of the conversation the model needs to see.
    const history: ChatTurn[] = messages
      .filter((message) => message.id !== WELCOME.id)
      .map(({ role, content }) => ({ role, content }));

    addMessage({ role: "user", content: question });
    setInput("");
    setLoading(true);

    try {
      const response = await askBot(question, history);

      // The medical disclaimer appears once per conversation, the first time it is relevant.
      const withDisclaimer = response.showDisclaimer && !disclaimerShown;
      if (withDisclaimer) setDisclaimerShown(true);

      const id = addMessage({
        role: "assistant",
        content: response.answer,
        response,
        withDisclaimer,
      });
      if (response.offerLeadForm && !leadSent) setLeadFormFor(id);
    } catch (err) {
      // The API's own error text ("Too many messages...") is already written for visitors.
      const content =
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again.";
      addMessage({ role: "assistant", content });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };

  const lastQuestion = messages.findLast((message) => message.role === "user")?.content ?? "";
  const conversationStarted = messages.length > 1;

  return (
    <section className="chat" aria-label="Chat">
      <div className="messages">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message}>
            {leadFormFor === message.id && !leadSent && (
              <LeadForm
                question={lastQuestion}
                onSent={() => setLeadSent(true)}
                onDismiss={() => setLeadFormFor(null)}
              />
            )}
          </ChatMessage>
        ))}
        {loading && (
          <div className="msg assistant">
            <div className="bubble typing">Checking our pages…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!conversationStarted && (
        <div className="suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => void send(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form className="composer" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about treatments, packages or prices…"
          maxLength={MAX_QUESTION_CHARS}
          aria-label="Your question"
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
