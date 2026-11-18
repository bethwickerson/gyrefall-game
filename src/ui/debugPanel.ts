import { defaultTuning, tuning, type Tuning } from "../config/tuning";

type Group = Record<string, number>;

/**
 * Live tuning panel. Every number in tuning.ts gets a slider and a number box.
 * Changes apply on the next simulation tick. Toggle with the backquote key.
 */
export class DebugPanel {
  readonly el = document.createElement("div");
  private readout = document.createElement("pre");
  private out = document.createElement("textarea");
  private inputs: Array<{ group: keyof Tuning; key: string; range: HTMLInputElement; num: HTMLInputElement; label: HTMLElement }> = [];
  getReadout: () => string = () => "";
  onToggle: (name: "freezeBots" | "godMode", on: boolean) => void = () => {};

  constructor(parent: HTMLElement) {
    this.el.className = "debug hidden";
    const title = document.createElement("h3");
    title.textContent = "GYREFALL TUNING  (` to close)";
    this.el.append(title, this.readout);

    const tools = document.createElement("div");
    tools.append(
      this.button("Export changed", () => this.exportChanged()),
      this.button("Reset all", () => this.reset()),
      this.toggle("Freeze bots", "freezeBots"),
      this.toggle("God mode", "godMode"),
    );
    this.el.append(tools, this.out);
    this.out.placeholder = "Export changed writes JSON here. Paste it into src/config/tuning.ts.";
    this.out.readOnly = true;

    for (const group of Object.keys(tuning) as Array<keyof Tuning>) {
      const details = document.createElement("details");
      if (group === "flight" || group === "combat") details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = group;
      details.append(summary);
      const values = tuning[group] as Group;
      const defaults = defaultTuning[group] as Group;
      for (const key of Object.keys(values)) {
        const def = defaults[key];
        const row = document.createElement("div");
        row.className = "p";
        const label = document.createElement("span");
        label.textContent = key;
        const range = document.createElement("input");
        range.type = "range";
        range.min = "0";
        range.max = String(def === 0 ? 1 : Math.abs(def) * 3);
        range.step = String(def === 0 ? 1 : Math.abs(def) / 100);
        const num = document.createElement("input");
        num.type = "number";
        num.step = range.step;
        const apply = (v: number): void => {
          if (!Number.isFinite(v)) return;
          values[key] = v;
          range.value = String(v);
          num.value = String(Number(v.toFixed(5)));
          label.classList.toggle("changed", v !== def);
        };
        range.addEventListener("input", () => apply(Number(range.value)));
        num.addEventListener("change", () => apply(Number(num.value)));
        apply(values[key]);
        row.append(label, range, num);
        details.append(row);
        this.inputs.push({ group, key, range, num, label });
      }
      this.el.append(details);
    }
    parent.append(this.el);
  }

  private button(text: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = text;
    b.addEventListener("click", fn);
    return b;
  }

  private toggle(text: string, name: "freezeBots" | "godMode"): HTMLButtonElement {
    let on = false;
    const b = this.button(`${text}: off`, () => {
      on = !on;
      b.textContent = `${text}: ${on ? "on" : "off"}`;
      this.onToggle(name, on);
    });
    return b;
  }

  private exportChanged(): void {
    const diff: Record<string, Group> = {};
    for (const group of Object.keys(tuning) as Array<keyof Tuning>) {
      const values = tuning[group] as Group;
      const defaults = defaultTuning[group] as Group;
      for (const key of Object.keys(values)) {
        if (values[key] !== defaults[key]) (diff[group] ??= {})[key] = values[key];
      }
    }
    this.out.value = JSON.stringify(diff, null, 2);
  }

  private reset(): void {
    for (const i of this.inputs) {
      const def = (defaultTuning[i.group] as Group)[i.key];
      (tuning[i.group] as Group)[i.key] = def;
      i.range.value = String(def);
      i.num.value = String(def);
      i.label.classList.remove("changed");
    }
  }

  get open(): boolean {
    return !this.el.classList.contains("hidden");
  }

  toggleOpen(): void {
    this.el.classList.toggle("hidden");
  }

  update(): void {
    if (this.open) this.readout.textContent = this.getReadout();
  }
}
