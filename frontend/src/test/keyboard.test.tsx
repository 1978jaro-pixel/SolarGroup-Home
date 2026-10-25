import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { VirtualKeyboard, editField, isEditable } from "../components/VirtualKeyboard";

function Form({ onSubmit }: { onSubmit: (v: { user: string; pass: string }) => void }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ user, pass });
      }}
    >
      <input aria-label="Používateľ" value={user} onChange={(e) => setUser(e.target.value)} />
      <input aria-label="Heslo" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
      <input aria-label="Dátum" type="date" />
    </form>
  );
}

const key = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("dotyková klávesnica", () => {
  it("v kiosku sa zobrazí, píše do riadeného poľa a potlačí systémovú klávesnicu", () => {
    render(
      <>
        <Form onSubmit={() => undefined} />
        <VirtualKeyboard forceEnabled />
      </>,
    );
    const user = screen.getByLabelText("Používateľ") as HTMLInputElement;
    act(() => user.focus());
    expect(screen.getByRole("group", { name: "Dotyková klávesnica" })).toBeInTheDocument();
    expect(user.getAttribute("inputmode")).toBe("none");
    key("j");
    key("a");
    key("Veľké písmená");
    key("R");
    key("o");
    expect(user.value).toBe("jaRo");
    key("Zmazať");
    expect(user.value).toBe("jaR");
  });

  it("heslo zostane skryté, Potvrdiť odošle formulár a klávesnica sa skryje", () => {
    const onSubmit = vi.fn();
    render(
      <>
        <Form onSubmit={onSubmit} />
        <VirtualKeyboard forceEnabled />
      </>,
    );
    act(() => (screen.getByLabelText("Používateľ") as HTMLInputElement).focus());
    key("a");
    const pass = screen.getByLabelText("Heslo") as HTMLInputElement;
    act(() => pass.focus());
    key("Čísla a symboly");
    key("1");
    key("#");
    key("Písmená");
    key("Slovenské znaky");
    key("č");
    expect(pass.type).toBe("password");
    expect(pass.value).toBe("1#č");
    key("Potvrdiť");
    expect(onSubmit).toHaveBeenCalledWith({ user: "a", pass: "1#č" });
    expect(screen.queryByRole("group", { name: "Dotyková klávesnica" })).toBeNull();
  });

  it("mimo kiosku (mobil, PC) sa nezobrazí a systémová klávesnica ostane", () => {
    render(
      <>
        <Form onSubmit={() => undefined} />
        <VirtualKeyboard forceEnabled={false} />
      </>,
    );
    const user = screen.getByLabelText("Používateľ");
    act(() => user.focus());
    expect(screen.queryByRole("group", { name: "Dotyková klávesnica" })).toBeNull();
    expect(user.getAttribute("inputmode")).toBeNull();
  });

  it("dátumové a výberové polia nechá systému", () => {
    render(<Form onSubmit={() => undefined} />);
    expect(isEditable(screen.getByLabelText("Dátum"))).toBe(false);
    expect(isEditable(screen.getByLabelText("Heslo"))).toBe(true);
  });

  it("vkladá na pozíciu kurzora a maže celý znak s diakritikou", () => {
    const input = document.createElement("input");
    input.value = "abd";
    input.setSelectionRange(2, 2);
    editField(input, { insert: "c" });
    expect(input.value).toBe("abcd");
    expect(input.selectionStart).toBe(3);
    input.value = "ľž";
    input.setSelectionRange(2, 2);
    editField(input, { backspace: true });
    expect(input.value).toBe("ľ");
  });
  // USB klávesnicu (fyzické stlačenie, isTrusted) overuje e2e test v Chromiu: e2e/kiosk-check.mjs
});
