import React from "react";
import { apiGet, apiPost } from "./lib/api";

function App() {
  const [status, setStatus] = React.useState<string>("Idle");
  const [payload, setPayload] = React.useState<string>("");

  async function handleLogin() {
    setStatus("Logging in...");
    setPayload("");

    try {
      const data = await apiPost("/v1/auth/login", {
        email: "admin@lims.local",
        password: "P@ssw0rd!",
        // device_name sengaja TIDAK dikirim → browser pakai cookie session saja
      });

      setStatus("Login OK (cookie should be set for lims.localhost)");
      setPayload(JSON.stringify(data, null, 2));
    } catch (err: any) {
      console.error("Login error", err);
      setStatus(`Login FAILED (status ${err?.status ?? "?"})`);
      setPayload(JSON.stringify(err?.data ?? err, null, 2));
    }
  }

  async function handleMe() {
    setStatus("Calling /auth/me...");
    setPayload("");

    try {
      const data = await apiGet("/v1/auth/me");
      setStatus("Me OK (session is valid)");
      setPayload(JSON.stringify(data, null, 2));
    } catch (err: any) {
      console.error("Me error", err);
      setStatus(`Me FAILED (status ${err?.status ?? "?"})`);
      setPayload(JSON.stringify(err?.data ?? err, null, 2));
    }
  }

  async function handleLogout() {
    setStatus("Logging out...");
    setPayload("");

    try {
      await apiPost("/v1/auth/logout", {});
      setStatus("Logout OK (session destroyed)");
    } catch (err: any) {
      console.error("Logout error", err);
      setStatus(`Logout FAILED (status ${err?.status ?? "?"})`);
      setPayload(JSON.stringify(err?.data ?? err, null, 2));
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
      <div className="w-full max-w-xl space-y-4 border border-slate-800 rounded-xl p-6 bg-slate-900/70">
        <h1 className="text-2xl font-semibold">Auth Playground (Cookie Flow)</h1>
        <p className="text-sm text-slate-300">
          Test Laravel Sanctum login via browser using HttpOnly cookies.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleLogin}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium"
          >
            Login as admin@lims.local
          </button>
          <button
            onClick={handleMe}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium"
          >
            Call /auth/me
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm font-medium"
          >
            Logout
          </button>
        </div>

        <div className="text-xs text-slate-300">
          <span className="font-semibold">Status:</span> {status}
        </div>

        <pre className="text-xs bg-slate-950/70 rounded-lg p-3 overflow-x-auto max-h-64">
          {payload || "// no data yet"}
        </pre>
      </div>
    </div>
  );
}

export default App;
