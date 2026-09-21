"use client";

import { useState, useEffect, useRef } from "react";
import ChatList from "@/components/chat/ChatList";
import ChatComposer from "@/components/chat/ChatComposer";
import AuthGate from "@/components/auth/AuthGate";

export interface ChatAttachment {
  name: string;
  mimeType: string;
  base64: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  attachment?: ChatAttachment | null;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}

const STORAGE_KEY = "intel_personal_sessions_v1";
const ACTIVE_SESSION_KEY = "intel_personal_active_id_v1";

function cleanSessionTitle(rawText: string, fallbackName?: string): string {
  if (!rawText && fallbackName) return fallbackName.replace(/\.[^/.]+$/, "");

  let cleaned = rawText
    .replace(/^(\/\*|\/\/|#+|<!--|\*)\s*/, "")
    .replace(/(\*\/|-->)\s*$/, "")
    .replace(/[`"'{}()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "Workspace Task";
  return cleaned.length > 36 ? `${cleaned.slice(0, 36).trim()}...` : cleaned;
}

export default function WorkspacePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Inline title editing
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const rawSessions = localStorage.getItem(STORAGE_KEY);
    const savedActiveId = localStorage.getItem(ACTIVE_SESSION_KEY);

    if (rawSessions) {
      try {
        const parsed: Session[] = JSON.parse(rawSessions);
        setSessions(parsed);
        if (savedActiveId && parsed.some((s) => s.id === savedActiveId)) {
          setActiveSessionId(savedActiveId);
        } else if (parsed.length > 0) {
          setActiveSessionId(parsed[0].id);
        }
      } catch (e) {
        console.error("Failed to restore sessions", e);
      }
    } else {
      createNewSession();
    }
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || {
    id: activeSessionId,
    title: "New Session",
    createdAt: Date.now(),
    messages: [],
  };

  useEffect(() => {
    if (activeSession.messages.length > 0 || loading) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "auto" });
      });
    }
  }, [activeSessionId, activeSession.messages.length, loading]);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
    if (activeSessionId) {
      localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSessionId]);

  const createNewSession = (title = "New Task") => {
    const newId = `session_${Date.now()}`;
    const newSession: Session = {
      id: newId,
      title,
      createdAt: Date.now(),
      messages: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
    setInput("");
    setAttachments([]);
  };

  const startRenaming = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitleValue(session.title);
  };

  const saveRenamedTitle = () => {
    if (!editingSessionId) return;
    const finalTitle = editTitleValue.trim() || "Workspace Task";
    setSessions((prev) =>
      prev.map((s) => (s.id === editingSessionId ? { ...s, title: finalTitle } : s))
    );
    setEditingSessionId(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      saveRenamedTitle();
    } else if (e.key === "Escape") {
      setEditingSessionId(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || loading) return;

    let attachedDataList: ChatAttachment[] = [];
    if (attachments.length > 0) {
      attachedDataList = await Promise.all(
        attachments.map(async (file) => ({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          base64: await fileToBase64(file),
        }))
      );
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: input,
      attachments: attachedDataList,
      timestamp: Date.now(),
    };

    const currentMessages = activeSession.messages;
    const nextMessages = [...currentMessages, userMessage];

    const isFirstMessage = currentMessages.length === 0;
    const updatedTitle = isFirstMessage
      ? cleanSessionTitle(input, attachedDataList[0]?.name)
      : activeSession.title;

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? { ...s, title: updatedTitle, messages: nextMessages }
          : s
      )
    );

    setInput("");
    setAttachments([]);
    setLoading(true);

    try {
      const auth = (await import("@/lib/firebase")).getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage.content,
          messages: nextMessages,
          attachments: attachedDataList,
        }),
      });

      const data = await res.json();
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.reply,
        timestamp: Date.now(),
      };

      const finalMessages = [...nextMessages, assistantMessage];

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? { ...s, messages: finalMessages }
            : s
        )
      );
    } catch (err) {
      console.error("Chat dispatch error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGate>
      {(user, handleSignOut) => (
        <div className="flex h-dvh w-full overflow-hidden bg-[#fafafa] text-stone-900 antialiased dark:bg-[#181818] dark:text-stone-100">
          {/* Sidebar */}
          <aside
            className={`${
              sidebarOpen ? "w-64" : "w-0"
            } flex flex-col shrink-0 border-r border-stone-200 bg-[#f7f7f8] transition-all duration-200 overflow-hidden dark:border-stone-800 dark:bg-[#171717]`}
          >
            <div className="flex items-center justify-between p-3">
              <button
                onClick={() => createNewSession()}
                className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-[#212121] dark:hover:bg-stone-800"
              >
                <span>+</span> New chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2 text-xs font-semibold text-stone-500">
              <p className="px-2 pb-1 text-[11px] uppercase tracking-wider text-stone-400">
                Notebooks & Tasks
              </p>
              <div className="space-y-1">
                {sessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const isEditing = session.id === editingSessionId;

                  return (
                    <div
                      key={session.id}
                      onClick={() => !isEditing && setActiveSessionId(session.id)}
                      className={`group relative flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition cursor-pointer ${
                        isActive
                          ? "bg-stone-200/80 text-stone-900 font-medium dark:bg-stone-800 dark:text-white"
                          : "text-stone-700 hover:bg-stone-200/50 dark:text-stone-300 dark:hover:bg-stone-800/60"
                      }`}
                    >
                      {isEditing ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editTitleValue}
                          onChange={(e) => setEditTitleValue(e.target.value)}
                          onBlur={saveRenamedTitle}
                          onKeyDown={handleEditKeyDown}
                          className="w-full rounded bg-white px-1.5 py-0.5 text-xs text-stone-900 shadow-sm outline-none ring-1 ring-stone-400 dark:bg-stone-900 dark:text-stone-100"
                        />
                      ) : (
                        <>
                          <span className="truncate pr-4 select-none">
                            {session.title || "Untitled Session"}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => startRenaming(session, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-stone-300/60 text-stone-400 hover:text-stone-700 transition dark:hover:bg-stone-700 dark:hover:text-stone-200"
                            title="Rename task"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              <path d="m15 5 4 4" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Profile Bar */}
            <div className="border-t border-stone-200 p-3 dark:border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white uppercase">
                  {user.email?.[0] || "U"}
                </div>
                <div
                  className="truncate text-xs font-medium text-stone-700 dark:text-stone-300 max-w-[120px]"
                  title={user.email || ""}
                >
                  {user.email}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-200 hover:text-rose-600 transition dark:text-stone-400 dark:hover:bg-stone-800"
              >
                Log out
              </button>
            </div>
          </aside>

          {/* Main Workspace Area - Expanded Canvas */}
          <main className="relative flex flex-1 min-w-0 min-h-0 flex-col overflow-hidden">
            <header className="h-12 shrink-0 flex items-center px-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded p-1.5 text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
                title="Toggle Sidebar"
              >
                ☰
              </button>
            </header>

            {activeSession.messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 pb-20">
                <h2 className="mb-6 text-2xl font-semibold tracking-tight text-stone-800 dark:text-stone-100">
                  What should we work on?
                </h2>
                {/* Widened initial composer */}
                <div className="w-full max-w-4xl px-4">
                  <ChatComposer
                    value={input}
                    onChange={setInput}
                    onSend={handleSend}
                    disabled={loading}
                    attachments={attachments}
                    onAttachmentsChange={setAttachments}
                    canAttach={true}
                    placeholder="Ask anything, drag files, or paste screenshots..."
                  />
                </div>
              </div>
            ) : (
              <div className="relative flex flex-1 min-h-0 w-full flex-col">
                <div
                  className="flex-1 min-h-0 w-full overflow-y-auto px-4 md:px-8 focus:outline-none"
                  style={{
                    touchAction: "pan-y",
                    overscrollBehaviorY: "contain",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  {/* Widened message container from max-w-3xl to max-w-6xl */}
                  <div className="mx-auto flex w-full max-w-6xl flex-col justify-start py-6 pointer-events-auto">
                    <ChatList
                      messages={activeSession.messages}
                      showTyping={loading}
                    />
                    <div ref={bottomRef} className="h-4 w-full shrink-0" />
                  </div>
                </div>

                {/* Widened bottom input container to max-w-5xl */}
                <div className="mx-auto w-full max-w-5xl shrink-0 p-4">
                  <ChatComposer
                    value={input}
                    onChange={setInput}
                    onSend={handleSend}
                    disabled={loading}
                    attachments={attachments}
                    onAttachmentsChange={setAttachments}
                    canAttach={true}
                    placeholder="Message your workspace..."
                  />
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </AuthGate>
  );
}