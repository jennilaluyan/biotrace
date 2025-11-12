import { useEffect } from "react";
import { apiGet } from "./lib/api";

export default function App() {
  useEffect(() => {
    apiGet("/health-check").catch((err) => {
      console.error(err);
    });
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-100 text-2xl">
      BioTrace Frontend Connected (env ready) ✅
    </div>
  );
}
