import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { isKiosk, onKioskChange } from "../utils/kiosk";
import { Icon } from "./Icon";

/**
 * Dotyková klávesnica integrovaná priamo do aplikácie (náhrada za squeekboard/wvkbd).
 *
 * - Zobrazí sa iba v režime kiosku pri dotyku textového poľa (aj heslo, e-mail, číslo…).
 * - Systémovú klávesnicu potlačí cez `inputmode="none"`, takže sa nezobrazia dve klávesnice.
 * - Tlačidlá neberú fokus poľu; text sa vkladá na pozíciu kurzora a React dostane bežnú udalosť `input`.
 * - Externá USB klávesnica funguje ďalej – pri jej použití sa dotyková klávesnica skryje.
 * - Pri hesle sa nič nezobrazuje (žiadne náhľady stlačených znakov).
 */

type Layer = "abc" | "123" | "sym" | "sk";
type Editable = HTMLInputElement | HTMLTextAreaElement;

const TEXT_TYPES = new Set(["text", "password", "search", "email", "url", "tel", "number", ""]);

export function isEditable(el: Element | null): el is Editable {
  if (!el) return false;
  if ((el as HTMLElement).dataset?.vk === "off") return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return TEXT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return false;
}

const LAYERS: Record<Layer, string[][]> = {
  abc: [
    ["q", "w", "e", "r", "t", "z", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", "@"],
    ["{shift}", "y", "x", "c", "v", "b", "n", "m", "-", "{bksp}"],
    ["{123}", "{sk}", ",", "{space}", ".", "{enter}", "{close}"],
  ],
  sk: [
    ["á", "ä", "č", "ď", "é", "í", "ĺ", "ľ", "ň", "ó"],
    ["ô", "ŕ", "š", "ť", "ú", "ý", "ž", "ö", "ü", "ß"],
    ["{shift}", "'", "\"", "!", "?", ":", ";", "/", "_", "{bksp}"],
    ["{abc}", "{123}", ",", "{space}", ".", "{enter}", "{close}"],
  ],
  "123": [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["@", "#", "$", "_", "&", "-", "+", "(", ")", "/"],
    ["{sym}", "*", "\"", "'", ":", ";", "!", "?", "%", "{bksp}"],
    ["{abc}", "{sk}", ",", "{space}", ".", "{enter}", "{close}"],
  ],
  sym: [
    ["~", "`", "|", "^", "=", "{", "}", "[", "]", "\\"],
    ["<", ">", "€", "£", "°", "§", "©", "®", "·", "…"],
    ["{123}", "×", "÷", "±", "µ", "¿", "¡", "«", "»", "{bksp}"],
    ["{abc}", "{sk}", ",", "{space}", ".", "{enter}", "{close}"],
  ],
};

const LABEL: Record<string, string> = {
  "{123}": "?123",
  "{abc}": "ABC",
  "{sym}": "#+=",
  "{sk}": "áäč",
  "{space}": "medzera",
};

const ARIA: Record<string, string> = {
  "{shift}": "Veľké písmená",
  "{bksp}": "Zmazať",
  "{enter}": "Potvrdiť",
  "{close}": "Skryť klávesnicu",
  "{space}": "Medzera",
  "{123}": "Čísla a symboly",
  "{abc}": "Písmená",
  "{sym}": "Ďalšie symboly",
  "{sk}": "Slovenské znaky",
};

function nativeSetter(el: Editable) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(proto, "value")!.set!;
}

/** Bezpečný prístup ku kurzoru – typy email/number ho nepodporujú. */
function selectionOf(el: Editable): [number, number] | null {
  try {
    const s = el.selectionStart;
    const e = el.selectionEnd;
    return s == null || e == null ? null : [s, e];
  } catch {
    return null;
  }
}

/** Vloží text / zmaže znak tak, aby to React zachytil ako bežné písanie. */
export function editField(el: Editable, action: { insert: string } | { backspace: true }): void {
  const value = el.value;
  const sel = selectionOf(el) ?? [value.length, value.length];
  let [start, end] = sel;
  let next: string;
  if ("insert" in action) {
    next = value.slice(0, start) + action.insert + value.slice(end);
    start = end = start + action.insert.length;
  } else {
    if (start === end && start > 0) start -= Array.from(value.slice(0, start)).slice(-1)[0].length;
    next = value.slice(0, start) + value.slice(end);
    end = start;
  }
  if (el instanceof HTMLInputElement && el.maxLength > 0 && next.length > el.maxLength) return;
  nativeSetter(el).call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  if (selectionOf(el)) {
    try {
      el.setSelectionRange(start, end);
    } catch {
      /* typ poľa nepodporuje výber */
    }
  }
}

export function VirtualKeyboard({ forceEnabled }: { forceEnabled?: boolean }) {
  const [enabled, setEnabled] = useState(() => forceEnabled ?? isKiosk());
  const [target, setTarget] = useState<Editable | null>(null);
  const [layer, setLayer] = useState<Layer>("abc");
  const [shift, setShift] = useState<"off" | "once" | "lock">("off");
  const panel = useRef<HTMLDivElement>(null);
  const lastShiftTap = useRef(0);
  const repeat = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (forceEnabled !== undefined) return;
    return onKioskChange(() => setEnabled(isKiosk()));
  }, [forceEnabled]);

  // Sledovanie fokusu textových polí
  useEffect(() => {
    if (!enabled) {
      setTarget(null);
      return;
    }
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as Element;
      if (!isEditable(el)) return;
      // systémová klávesnica (squeekboard, mobil) sa nezobrazí
      if (!el.hasAttribute("data-vk-im")) {
        el.setAttribute("data-vk-im", el.getAttribute("inputmode") ?? "");
        el.setAttribute("inputmode", "none");
      }
      setTarget(el);
      setLayer(el instanceof HTMLInputElement && (el.type === "number" || el.type === "tel") ? "123" : "abc");
      setShift("off");
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Element | null;
      if (next && isEditable(next)) return;
      if (next && panel.current?.contains(next)) return;
      setTarget((t) => (t === e.target ? null : t));
    };
    // fyzická klávesnica → dotykovú skryjeme
    const onKey = (e: KeyboardEvent) => {
      if (e.isTrusted && isEditable(e.target as Element) && !["Shift", "Control", "Alt", "Meta"].includes(e.key)) setTarget(null);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKey, true);
    // pole, ktoré už má fokus (napr. autofocus pred pripojením klávesnice)
    if (isEditable(document.activeElement)) onFocusIn({ target: document.activeElement } as unknown as FocusEvent);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [enabled]);

  // Rozloženie stránky: miesto pre klávesnicu a pole vždy nad ňou
  useEffect(() => {
    const root = document.documentElement;
    if (!target || !panel.current) {
      root.classList.remove("vk-open");
      root.style.removeProperty("--vk-h");
      return;
    }
    const h = panel.current.getBoundingClientRect().height;
    root.style.setProperty("--vk-h", `${Math.round(h)}px`);
    root.classList.add("vk-open");
    const id = window.requestAnimationFrame(() => {
      const r = target.getBoundingClientRect();
      if (r.bottom > window.innerHeight - h - 8 || r.top < 0) target.scrollIntoView?.({ block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [target]);

  useEffect(() => () => window.clearInterval(repeat.current), []);

  const press = useCallback(
    (key: string) => {
      const el = target;
      if (!el) return;
      if (!document.contains(el)) return setTarget(null);
      switch (key) {
        case "{shift}": {
          const now = Date.now();
          setShift((s) => (s === "off" ? (now - lastShiftTap.current < 350 ? "lock" : "once") : now - lastShiftTap.current < 350 ? "lock" : "off"));
          lastShiftTap.current = now;
          return;
        }
        case "{bksp}":
          return editField(el, { backspace: true });
        case "{space}":
          return editField(el, { insert: " " });
        case "{enter}":
          if (el instanceof HTMLTextAreaElement) return editField(el, { insert: "\n" });
          setTarget(null);
          if (el.form) el.form.requestSubmit();
          else el.blur();
          return;
        case "{close}":
          setTarget(null);
          el.blur();
          return;
        case "{123}":
        case "{abc}":
        case "{sym}":
        case "{sk}":
          setLayer(key.slice(1, -1) as Layer);
          return;
        default: {
          const ch = shift !== "off" ? key.toLocaleUpperCase("sk-SK") : key;
          editField(el, { insert: ch });
          if (shift === "once") setShift("off");
        }
      }
    },
    [target, shift],
  );

  if (!enabled || !target) return null;

  // tlačidlo nesmie zobrať fokus vstupnému poľu
  const keep = (e: ReactPointerEvent) => e.preventDefault();
  const startRepeat = (key: string) => {
    window.clearInterval(repeat.current);
    if (key !== "{bksp}") return;
    const startedAt = Date.now();
    repeat.current = window.setInterval(() => Date.now() - startedAt > 450 && press("{bksp}"), 70);
  };
  const stopRepeat = () => window.clearInterval(repeat.current);

  return (
    <div ref={panel} className="vk" role="group" aria-label="Dotyková klávesnica" onPointerDown={keep} onContextMenu={(e) => e.preventDefault()}>
      {LAYERS[layer].map((row, i) => (
        <div key={i} className="vk__row">
          {row.map((key) => {
            const special = key.startsWith("{");
            const text = special ? LABEL[key] : shift !== "off" ? key.toLocaleUpperCase("sk-SK") : key;
            return (
              <button
                key={key}
                type="button"
                tabIndex={-1}
                className={`vk__key ${special ? "vk__key--fn" : ""} vk__key--${key.replace(/[{}]/g, "") || "x"} ${key === "{shift}" && shift !== "off" ? `is-${shift}` : ""}`}
                aria-label={ARIA[key] ?? text}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startRepeat(key);
                }}
                onPointerUp={stopRepeat}
                onPointerLeave={stopRepeat}
                onClick={() => press(key)}
              >
                {key === "{shift}" ? <Icon name="arrowUp" size={22} /> : key === "{bksp}" ? <Icon name="backspace" size={24} /> : key === "{enter}" ? "OK" : key === "{close}" ? <Icon name="chevronDown" size={22} /> : text}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
