import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import { Icon } from "../components/Icon";
import { useApp } from "../hooks/AppContext";

export function LoginPage() {
  const { setupRequired, setupAllowedHere, reloadAuth, mode } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setup = setupRequired;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setup && password !== password2) {
      setError("Heslá sa nezhodujú");
      return;
    }
    setBusy(true);
    try {
      await api.post(setup ? "/api/auth/setup" : "/api/auth/login", { username, password });
      await reloadAuth();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Prihlásenie zlyhalo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="brand brand--center">
          <span className="brand__logo">
            <Icon name="solar" size={22} />
          </span>
          <span>
            <strong>SolarGroup</strong> Home
          </span>
        </div>
        {mode === "demo" && <span className="badge badge--demo">DEMO režim</span>}
        <h1>{setup ? "Vytvorenie účtu" : "Prihlásenie"}</h1>
        {setup && !setupAllowedHere ? (
          <p className="muted">
            Prvý účet je z bezpečnostných dôvodov možné vytvoriť iba priamo na zariadení (adresa <code>localhost</code>) alebo príkazom{" "}
            <code>python -m app.cli create-user meno</code>.
          </p>
        ) : (
          <>
            {setup && <p className="muted small">Účet chráni ovládanie domácnosti. Heslo musí mať aspoň 10 znakov.</p>}
            <label className="field">
              <span>Používateľ</span>
              <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={setup ? 3 : 1} />
            </label>
            <label className="field">
              <span>Heslo</span>
              <input
                type="password"
                autoComplete={setup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={setup ? 10 : 1}
              />
            </label>
            {setup && (
              <label className="field">
                <span>Heslo znova</span>
                <input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required minLength={10} />
              </label>
            )}
            {error && (
              <div className="alert alert--danger" role="alert">
                {error}
              </div>
            )}
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {setup ? "Vytvoriť účet" : "Prihlásiť sa"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export function ServerDown() {
  return (
    <div className="login">
      <div className="login__card">
        <Icon name="offline" size={36} />
        <h1>Server je nedostupný</h1>
        <p className="muted">Nedá sa spojiť so serverom SolarGroup Home. Skúšam to znova…</p>
      </div>
    </div>
  );
}
