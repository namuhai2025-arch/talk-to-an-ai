"use client";

type EmailAuthMode = "signup" | "signin";

type EmailAuthCardProps = {
  emailAuthMode: EmailAuthMode;
  emailAddress: string;
  emailPassword: string;
  emailAuthError: string;
  isSigningIn: boolean;
  signingProvider: "google" | "apple" | "email" | null;
  onModeChange: (mode: EmailAuthMode) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export default function EmailAuthCard({
  emailAuthMode,
  emailAddress,
  emailPassword,
  emailAuthError,
  isSigningIn,
  signingProvider,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onCancel,
}: EmailAuthCardProps) {
  return (
    <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="mb-4 flex rounded-xl bg-stone-200/70 p-1">
        <button
          type="button"
          onClick={() => onModeChange("signup")}
          disabled={isSigningIn}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
            emailAuthMode === "signup"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500"
          }`}
        >
          Create account
        </button>

        <button
          type="button"
          onClick={() => onModeChange("signin")}
          disabled={isSigningIn}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
            emailAuthMode === "signin"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500"
          }`}
        >
          Sign in
        </button>
      </div>

      <input
        type="email"
        autoComplete="email"
        value={emailAddress}
        onChange={(event) => onEmailChange(event.target.value)}
        placeholder="Email address"
        className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 outline-none focus:border-emerald-500"
      />

      <input
        type="password"
        autoComplete={
          emailAuthMode === "signup"
            ? "new-password"
            : "current-password"
        }
        value={emailPassword}
        onChange={(event) => onPasswordChange(event.target.value)}
        placeholder="Password"
        className="mt-3 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 outline-none focus:border-emerald-500"
      />

      {emailAuthError && (
        <p className="mt-3 text-sm leading-5 text-red-600">
          {emailAuthError}
        </p>
      )}

      <button
        type="button"
        disabled={isSigningIn}
        onClick={onSubmit}
        className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {signingProvider === "email"
          ? "Please wait..."
          : emailAuthMode === "signup"
            ? "Create account"
            : "Sign in"}
      </button>

      <button
        type="button"
        disabled={isSigningIn}
        onClick={onCancel}
        className="mt-3 w-full text-sm font-medium text-stone-500"
      >
        Cancel
      </button>

      {emailAuthMode === "signup" && (
        <p className="mt-4 text-xs leading-5 text-stone-500">
          You can begin using Talkio immediately. If you choose to subscribe later, we’ll first send a link to verify your email.
        </p>
      )}
    </div>
  );
}