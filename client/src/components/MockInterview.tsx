import { useState, useRef, useEffect } from "react";
import { api } from "../api";

interface Props {
  applicationId: string;
}

interface Message {
  role: "interviewer" | "you";
  text: string;
}

export function MockInterview({ applicationId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function start() {
    setLoading(true);
    setError(null);
    setMessages([]);
    try {
      const res = await api.startInterview(applicationId);
      setMessages([{ role: "interviewer", text: res.reply }]);
      setStarted(true);
    } catch {
      setError("Could not start interview — try again");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const text = inputText.trim();
    if (!text || loading) return;
    setInputText("");
    setMessages((prev) => [...prev, { role: "you", text }]);
    setLoading(true);
    setError(null);
    try {
      const res = await api.sendInterviewMessage(applicationId, text);
      setMessages((prev) => [...prev, { role: "interviewer", text: res.reply }]);
    } catch {
      setError("Send failed — try again");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="mock-interview">
      {!started && (
        <div className="mock-interview-start">
          <p className="hint">Practice answering interview questions based on this job's requirements.</p>
          <button className="btn btn-primary" onClick={start} disabled={loading}>
            {loading ? "Starting…" : "Start Mock Interview"}
          </button>
        </div>
      )}
      {started && (
        <>
          <div className="interview-messages">
            {messages.map((m, i) => (
              <div key={i} className={`interview-msg interview-msg--${m.role}`}>
                <span className="interview-msg-label">{m.role === "interviewer" ? "Interviewer" : "You"}</span>
                <p>{m.text}</p>
              </div>
            ))}
            {loading && (
              <div className="interview-msg interview-msg--interviewer">
                <span className="interview-msg-label">Interviewer</span>
                <p className="hint">Thinking…</p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="interview-input-row">
            <textarea
              className="email-textarea"
              rows={3}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer… (Enter to send, Shift+Enter for newline)"
              disabled={loading}
            />
            <button className="btn btn-primary btn-sm" onClick={send} disabled={loading || !inputText.trim()}>
              Send
            </button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={start} disabled={loading} style={{ marginTop: "8px" }}>
            Start Over
          </button>
        </>
      )}
    </div>
  );
}
