/** Tiny typed event bus so systems stay decoupled from rendering, UI and audio. */
export type GameEvents = {
  strike: { attacker: number; defender: number; damage: number; clean: boolean; closing: number; drop: number };
  dodge: { attacker: number; defender: number };
  defeat: { victim: number; killer: number | null; cause: "strike" | "zone" | "crash" };
  pickup: { flyer: number; shards: number };
  crash: { flyer: number; damage: number };
  flap: { flyer: number };
  flare: { flyer: number };
  phase: { phase: string };
};

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Handler<never>[]>();

  on<K extends keyof GameEvents>(type: K, handler: Handler<GameEvents[K]>): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as Handler<never>);
    this.handlers.set(type, list);
    return () => {
      const i = list.indexOf(handler as Handler<never>);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const list = this.handlers.get(type);
    if (!list) return;
    for (const h of list) (h as Handler<GameEvents[K]>)(payload);
  }
}
