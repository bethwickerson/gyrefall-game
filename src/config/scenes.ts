/**
 * Scene registry. Scenes load in order: the first one loads, the game signals
 * ready, then the rest load in the background. The Ribs and The Heart are
 * planned and only reserve their slots here.
 */
export interface SceneDef {
  id: string;
  name: string;
  /** Model ids from the asset manager this scene needs before it can show. */
  assets: string[];
  available: boolean;
}

export const scenes: SceneDef[] = [
  {
    id: "rift-test",
    name: "The Rift (test arena)",
    assets: ["mount.gyrehawk", "rider.warden", "armor.bonemail", "pickup.shard"],
    available: true,
  },
  { id: "ribs", name: "The Ribs", assets: [], available: false },
  { id: "heart", name: "The Heart", assets: [], available: false },
];
