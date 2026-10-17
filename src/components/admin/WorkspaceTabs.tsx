import { T } from "./ui";
export function WorkspaceTabs<T extends string>({
  items,
  value,
  onChange,
  label = "Workspace views",
}: {
  items: readonly { id: T; label: string; description?: string }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <nav aria-label={label} className="admin-workspace-tabs">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-current={value === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
          style={{ color: value === item.id ? T.ink : T.muted }}
        >
          <strong>{item.label}</strong>
          {item.description ? <span>{item.description}</span> : null}
        </button>
      ))}
    </nav>
  );
}
