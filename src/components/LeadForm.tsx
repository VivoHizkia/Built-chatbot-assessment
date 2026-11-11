"use client";

import { useState, type FormEvent } from "react";

type Props = {
  // The question that led here, sent along so the team has context.
  question: string;
  onSent: () => void;
  onDismiss: () => void;
};

type Status = "idle" | "sending" | "sent" | "error";

export function LeadForm({ question, onSent, onDismiss }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, question }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not send");
      setStatus("sent");
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
      setStatus("error");
    }
  };

  if (status === "sent") {
    return <p className="lead-ok">Thanks! The PlacidWay team will contact you by email.</p>;
  }

  return (
    <form className="lead" onSubmit={onSubmit}>
      <p>Want a personal quote? Leave your name and email and the PlacidWay team will reply.</p>
      <div className="lead-row">
        <input
          required
          placeholder="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={200}
        />
        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send"}
        </button>
        <button type="button" className="ghost" onClick={onDismiss}>
          No thanks
        </button>
      </div>
      {status === "error" && <p className="lead-error">{error}</p>}
    </form>
  );
}
