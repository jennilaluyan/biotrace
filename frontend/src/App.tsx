import React from "react";
import { clientService } from "./lib/clients";
import { sampleService } from "./lib/samples";

function App() {
  const [status, setStatus] = React.useState<string>("Idle");
  const [payload, setPayload] = React.useState<string>("");

  async function handleLoadClients() {
    setStatus("Memuat data clients...");
    setPayload("");

    try {
      const data = await clientService.getAll();
      setStatus(`Berhasil mengambil ${data.length} client(s) dari /v1/clients`);
      setPayload(JSON.stringify(data, null, 2));
    } catch (err: any) {
      console.error("Clients error", err);
      setStatus(`Gagal mengambil data clients (status ${err?.status ?? "?"})`);
      setPayload(JSON.stringify(err?.data ?? err, null, 2));
    }
  }

  async function handleLoadSamples() {
    setStatus("Memuat data samples...");
    setPayload("");

    try {
      const data = await sampleService.getAll();
      setStatus(`Berhasil mengambil ${data.length} sample(s) dari /v1/samples`);
      setPayload(JSON.stringify(data, null, 2));
    } catch (err: any) {
      console.error("Samples error", err);
      setStatus(`Gagal mengambil data samples (status ${err?.status ?? "?"})`);
      setPayload(JSON.stringify(err?.data ?? err, null, 2));
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
      <div className="w-full max-w-2xl space-y-4 border border-slate-800 rounded-xl p-6 bg-slate-900/70">
        <h1 className="text-2xl font-semibold">LIMS API Playground</h1>
        <p className="text-sm text-slate-300">
          Pengujian integrasi Axios service ke endpoint <code>/v1/clients</code>{" "}
          dan <code>/v1/samples</code>.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleLoadClients}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium"
          >
            Test GET /v1/clients
          </button>
          <button
            onClick={handleLoadSamples}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium"
          >
            Test GET /v1/samples
          </button>
        </div>

        <div className="text-xs text-slate-300">
          <span className="font-semibold">Status:</span> {status}
        </div>

        <pre className="text-xs bg-slate-950/70 rounded-lg p-3 overflow-x-auto max-h-72">
          {payload || "// belum ada data – klik salah satu tombol di atas"}
        </pre>
      </div>
    </div>
  );
}

export default App;
