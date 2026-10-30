import { useCallback, useEffect, useState } from "react";
import { detectProviders } from "./api";
import type { ProviderStatus, Settings } from "./types";

export function useProviders(settings: Settings) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await detectProviders(settings.providers);
      setProviders(result);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [settings.providers]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { providers, loading, error, refresh };
}
