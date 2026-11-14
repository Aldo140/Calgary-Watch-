import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ownerInstant, ownerLocalDate } from "../../lib/ownerListingEdits";
import {
  FIELD_COPY,
  SOCIAL_NAMES,
  WEEK,
  fieldLabel,
  normalizeLink,
} from "../../lib/ownerProfileGuide";

const lists = ["categories", "tags", "services", "amenities"];
const listText = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");

/**
 * Keeps what the owner is typing on screen even when the saved value is
 * normalised (a list drops a trailing comma, a link gains https://), so a
 * comma or a half-typed link never disappears under their fingers.
 */
function useTyping(value: string, same: (typed: string, saved: string) => boolean) {
  const [typed, setTyped] = useState(value);
  const latest = useRef(typed);
  latest.current = typed;
  useEffect(() => {
    if (!same(latest.current, value)) setTyped(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return [typed, setTyped] as const;
}

function Hint({ field, id }: { field: string; id: string }) {
  const hint = FIELD_COPY[field]?.hint;
  return hint ? (
    <small className="ow-hint" id={id}>
      {hint}
    </small>
  ) : null;
}

function Problem({ text, id }: { text?: string; id: string }) {
  return text ? (
    <small className="ow-problem" role="alert" id={id}>
      {text}
    </small>
  ) : null;
}

function Label({ field, changed, children }: { field: string; changed?: boolean; children?: ReactNode }) {
  return (
    <span className="ow-label">
      {children ?? fieldLabel(field)}
      {changed ? <em className="ow-edited">Edited</em> : null}
    </span>
  );
}

function LinkInput({
  network,
  value,
  disabled,
  onChange,
  placeholder,
  describedBy,
}: {
  network?: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  describedBy?: string;
}) {
  const [typed, setTyped] = useTyping(value, (t, saved) => normalizeLink(t, network) === saved || t === saved);
  return (
    <input
      type="text"
      inputMode="url"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      value={typed}
      readOnly={disabled}
      placeholder={placeholder}
      aria-describedby={describedBy}
      onChange={(e) => {
        setTyped(e.target.value);
        onChange(normalizeLink(e.target.value, network));
      }}
      onBlur={() => {
        const next = normalizeLink(typed, network);
        if (next !== typed) setTyped(next);
      }}
    />
  );
}

function HoursEditor({ data, disabled, onChange, changed }: { data: Record<string, string>; disabled: boolean; onChange: (v: string) => void; changed?: boolean }) {
  const set = (next: Record<string, string>) => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(next)) if (v) clean[k] = v;
    onChange(JSON.stringify(clean));
  };
  const extra = Object.keys(data).filter((k) => !WEEK.includes(k));
  const first = WEEK.map((d) => data[d]).find(Boolean);
  return (
    <fieldset className="ow-hours">
      <legend>
        <Label field="hours" changed={changed} />
      </legend>
      <Hint field="hours" id="ow-hint-hours" />
      {[...WEEK, ...extra].map((day) => {
        const value = data[day] ?? "";
        const closed = /^closed$/i.test(value);
        return (
          <div className="ow-day" key={day} data-closed={closed || undefined}>
            <label className="ow-day-name" htmlFor={`ow-hours-${day}`}>
              {day}
            </label>
            <input
              id={`ow-hours-${day}`}
              type="text"
              value={closed ? "" : value}
              readOnly={disabled || closed}
              placeholder={closed ? "Closed" : "9am–5pm"}
              onChange={(e) => set({ ...data, [day]: e.target.value })}
            />
            <label className="ow-closed">
              <input
                type="checkbox"
                checked={closed}
                disabled={disabled}
                onChange={(e) => set({ ...data, [day]: e.target.checked ? "Closed" : "" })}
              />
              Closed
            </label>
          </div>
        );
      })}
      {first && !disabled ? (
        <div className="ow-hours-tools">
          <button
            type="button"
            className="ow-chipbtn"
            onClick={() => set({ ...data, ...Object.fromEntries(WEEK.slice(0, 5).map((d) => [d, first])) })}
          >
            Copy “{first}” to Mon–Fri
          </button>
          <button
            type="button"
            className="ow-chipbtn"
            onClick={() => set({ ...data, ...Object.fromEntries(WEEK.map((d) => [d, first])) })}
          >
            Use it every day
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

function SocialsEditor({ data, disabled, onChange, changed, problem }: { data: Record<string, string>; disabled: boolean; onChange: (v: string) => void; changed?: boolean; problem?: string }) {
  const keys = [...new Set([...Object.keys(data), "instagram", "facebook", "tiktok"])];
  return (
    <fieldset className="ow-socials">
      <legend>
        <Label field="socials" changed={changed} />
      </legend>
      <Hint field="socials" id="ow-hint-socials" />
      {keys.map((key) => (
        <label key={key} className="pl-field">
          <span>{SOCIAL_NAMES[key] ?? key}</span>
          <LinkInput
            network={key}
            value={data[key] ?? ""}
            disabled={disabled}
            placeholder={key === "website" ? "yourshop.ca" : key === "facebook" ? "facebook.com/yourshop" : "@yourshop"}
            describedBy="ow-hint-socials"
            onChange={(v) => {
              const next = { ...data };
              if (v) next[key] = v;
              else delete next[key];
              onChange(JSON.stringify(next));
            }}
          />
        </label>
      ))}
      <Problem text={problem} id="ow-problem-socials" />
    </fieldset>
  );
}

export function OwnerFieldEditor({
  field,
  value,
  disabled,
  onChange,
  problem,
  changed,
}: {
  field: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  /** A friendly message when the value would be refused. */
  problem?: string;
  /** Marks a field the owner has changed but not published. */
  changed?: boolean;
}) {
  const uid = useId();
  const hintId = `${uid}-hint`,
    problemId = `${uid}-problem`;
  const [dateError, setDateError] = useState("");
  const isList = lists.includes(field);
  const [typed, setTyped] = useTyping(value, (t, saved) => (isList ? listText(t) === saved : t === saved));
  const changeDate = (text: string, apply: (iso: string) => void) => {
    try {
      apply(ownerInstant(text));
      setDateError("");
    } catch (e) {
      setDateError(e instanceof Error ? e.message : "Choose another time.");
    }
  };
  if (field === "start" || field === "end")
    return (
      <label className="pl-field">
        <Label field={field} changed={changed}>
          {field === "start" ? "Starts" : "Ends"} (Calgary time)
        </Label>
        <input
          type="datetime-local"
          value={ownerLocalDate(value)}
          readOnly={disabled}
          onChange={(e) => changeDate(e.target.value, onChange)}
        />
        {dateError ? <small role="alert">{dateError}</small> : null}
        <Problem text={problem} id={problemId} />
      </label>
    );
  let data: any;
  try {
    data = JSON.parse(value || (["priceRange"].includes(field) ? "[0,0]" : "{}"));
  } catch {
    data = {};
  }
  if (field === "occurrences") {
    const dates = Array.isArray(data) ? data : [];
    const update = (index: number, patch: Record<string, unknown>) =>
      onChange(JSON.stringify(dates.map((d, i) => (i === index ? { ...d, ...patch } : d))));
    return (
      <fieldset className="pl-step">
        <legend>Market dates · Calgary time</legend>
        {dates.map((date, i) => (
          <div key={date.id ?? i} className="pl-step">
            <label className="pl-field">
              <span>Starts</span>
              <input
                type="datetime-local"
                readOnly={disabled}
                value={ownerLocalDate(date.start)}
                onChange={(e) => changeDate(e.target.value, (start) => update(i, { start }))}
              />
            </label>
            <label className="pl-field">
              <span>Ends</span>
              <input
                type="datetime-local"
                readOnly={disabled}
                value={ownerLocalDate(date.end)}
                onChange={(e) => changeDate(e.target.value, (end) => update(i, { end }))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                disabled={disabled}
                checked={date.cancelled}
                onChange={(e) => update(i, { cancelled: e.target.checked })}
              />{" "}
              Cancelled
            </label>
          </div>
        ))}
        <button
          type="button"
          disabled={disabled || dates.length >= 100}
          onClick={() => onChange(JSON.stringify([...dates, { start: "", end: "", cancelled: false }]))}
        >
          Add market date
        </button>
        {dateError ? <p role="alert">{dateError}</p> : null}
      </fieldset>
    );
  }
  if (field === "hours")
    return <HoursEditor data={data && typeof data === "object" && !Array.isArray(data) ? data : {}} disabled={disabled} onChange={onChange} changed={changed} />;
  if (field === "socials")
    return (
      <SocialsEditor
        data={data && typeof data === "object" && !Array.isArray(data) ? data : {}}
        disabled={disabled}
        onChange={onChange}
        changed={changed}
        problem={problem}
      />
    );
  if (field === "coordinates" || field === "priceRange") {
    const keys = field === "coordinates" ? ["lat", "lng"] : ["0", "1"];
    return (
      <fieldset className="pl-step">
        <legend>
          <Label field={field} changed={changed} />
        </legend>
        <Hint field={field} id={hintId} />
        {keys.map((key, i) => (
          <label key={key} className="pl-field">
            <span>{field === "coordinates" ? (i ? "Longitude" : "Latitude") : i ? "Maximum ($)" : "Minimum ($)"}</span>
            <input
              type="number"
              step="any"
              value={data[key] ?? ""}
              readOnly={disabled}
              onChange={(e) => {
                const next = field === "coordinates" ? { ...data } : [...(Array.isArray(data) ? data : [0, 0])];
                next[key] = e.target.value === "" ? null : Number(e.target.value);
                onChange(JSON.stringify(next));
              }}
            />
          </label>
        ))}
      </fieldset>
    );
  }
  const copy = FIELD_COPY[field];
  const described = [copy?.hint ? hintId : "", problem ? problemId : ""].filter(Boolean).join(" ") || undefined;
  const change = (text: string) => {
    setTyped(text);
    onChange(text);
  };
  return (
    <label className="pl-field" data-problem={problem ? true : undefined}>
      <Label field={field} changed={changed} />
      {["cancelled", "petFriendly", "familyFriendly"].includes(field) ? (
        <select value={value || "false"} disabled={disabled} onChange={(e) => change(e.target.value)}>
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      ) : field === "pricing" ? (
        <select value={value || "unknown"} disabled={disabled} onChange={(e) => change(e.target.value)}>
          <option value="unknown">See official source</option>
          <option value="free">Free</option>
          <option value="paid">Paid</option>
        </select>
      ) : field === "priceLevel" ? (
        <select value={value || ""} disabled={disabled} onChange={(e) => change(e.target.value)} aria-describedby={described}>
          <option value="" disabled>
            Choose one
          </option>
          <option value="1">$ · Budget</option>
          <option value="2">$$ · Moderate</option>
          <option value="3">$$$ · Pricier</option>
          <option value="4">$$$$ · Premium</option>
        </select>
      ) : ["website", "tickets"].includes(field) ? (
        <LinkInput value={value} disabled={disabled} onChange={onChange} placeholder={copy?.placeholder} describedBy={described} />
      ) : ["description", "summary"].includes(field) ? (
        <textarea
          rows={field === "description" ? 6 : 2}
          value={typed}
          readOnly={disabled}
          placeholder={copy?.placeholder}
          aria-describedby={described}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <input
          type={field === "phone" ? "tel" : field === "email" ? "email" : "text"}
          inputMode={field === "phone" ? "tel" : field === "email" ? "email" : undefined}
          autoComplete={field === "phone" ? "tel" : field === "address" ? "street-address" : field === "email" ? "email" : "off"}
          value={typed}
          readOnly={disabled}
          placeholder={copy?.placeholder}
          aria-describedby={described}
          onChange={(e) => change(e.target.value)}
        />
      )}
      {copy?.hint ? (
        <small className="ow-hint" id={hintId}>
          {copy.hint}
        </small>
      ) : null}
      {field === "summary" && typed.length > 140 ? (
        <small className="ow-hint">{typed.length} characters. Shorter reads better on phones.</small>
      ) : null}
      <Problem text={problem} id={problemId} />
    </label>
  );
}
