import { useSearchParams } from "react-router-dom";
export function useAdminView<T extends string>(
  values: readonly T[],
  fallback: T,
  key = "view",
) {
  const [params, setParams] = useSearchParams();
  const requested = params.get(key);
  const view = values.includes(requested as T) ? (requested as T) : fallback;
  return [
    view,
    (next: T) =>
      setParams((previous) => {
        const p = new URLSearchParams(previous);
        p.set(key, next);
        return p;
      }),
  ] as const;
}
