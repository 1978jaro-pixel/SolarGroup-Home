/** Výber času v 24-hodinovom formáte (nezávislý od jazyka prehliadača, pohodlný na dotyk). */
export function TimeField({ value, onChange, step = 10, label, disabled }: { value: string; onChange: (v: string) => void; step?: number; label: string; disabled?: boolean }) {
  const [h, m] = value.split(":");
  const minutes = Array.from({ length: 60 / step }, (_, i) => String(i * step).padStart(2, "0"));
  if (!minutes.includes(m)) minutes.push(m);
  minutes.sort();
  return (
    <span className="timefield" role="group" aria-label={label}>
      <select aria-label={`${label} – hodina`} value={h} disabled={disabled} onChange={(e) => onChange(`${e.target.value}:${m}`)}>
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span aria-hidden="true">:</span>
      <select aria-label={`${label} – minúta`} value={m} disabled={disabled} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
        {minutes.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </span>
  );
}
