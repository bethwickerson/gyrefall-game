import {
  BoxGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial, OctahedronGeometry, SphereGeometry,
  type Object3D, type WebGLRenderer,
} from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import manifest from "../config/assets.json";

interface AssetEntry {
  placeholder: string;
  /** Relative path to a GLB with exact letter case, or null while the art is a gray box. */
  glb: string | null;
}

type Factory = () => Object3D;

/**
 * One place that hands out every model. Each id has a gray box placeholder now
 * and can point at a GLB later without touching game code. GLB loading supports
 * meshopt compression and KTX2 textures. The loaders are only fetched when the
 * first real GLB is requested, so they cost nothing in the skeleton.
 */
export class AssetManager {
  private entries = manifest as Record<string, AssetEntry>;
  private factories = new Map<string, Factory>();
  private loaded = new Map<string, Object3D>();
  private loader: Promise<GLTFLoader> | null = null;

  constructor(private renderer: WebGLRenderer) {
    registerPlaceholders(this);
  }

  registerPlaceholder(kind: string, factory: Factory): void {
    this.factories.set(kind, factory);
  }

  private getLoader(): Promise<GLTFLoader> {
    this.loader ??= (async () => {
      const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
        import("three/addons/loaders/GLTFLoader.js"),
        import("three/addons/loaders/KTX2Loader.js"),
        import("three/addons/libs/meshopt_decoder.module.js"),
      ]);
      // Relative path so the transcoder loads from the game's own files.
      const ktx2 = new KTX2Loader().setTranscoderPath("./basis/").detectSupport(this.renderer);
      return new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
    })();
    return this.loader;
  }

  /** Load any GLBs behind these ids. A failed or missing GLB keeps its placeholder. */
  async preload(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map(async (id) => {
        const entry = this.entries[id];
        if (!entry?.glb || this.loaded.has(id)) return;
        try {
          const loader = await this.getLoader();
          const gltf = await loader.loadAsync(entry.glb);
          this.loaded.set(id, gltf.scene);
        } catch (err) {
          console.warn(`Asset ${id} kept its placeholder`, err);
        }
      }),
    );
  }

  /** A fresh instance of a model, or of its placeholder. */
  instantiate(id: string): Object3D {
    const model = this.loaded.get(id);
    if (model) return model.clone(true);
    const kind = this.entries[id]?.placeholder ?? "";
    const factory = this.factories.get(kind);
    return factory ? factory() : new Group();
  }
}

const stone = (color: number, emissive = 0x000000): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, emissive, roughness: 0.9, metalness: 0, flatShading: true });

/** Gray box stand-ins. Parts are named so the view can fold wings and tint armor. */
const registerPlaceholders = (assets: AssetManager): void => {
  assets.registerPlaceholder("mount", () => {
    const g = new Group();
    const body = new Mesh(new ConeGeometry(0.9, 4.6, 6), stone(0x8a8f96));
    body.rotation.x = -Math.PI / 2;
    body.name = "body";
    g.add(body);
    for (const side of [-1, 1]) {
      const pivot = new Group();
      pivot.name = side < 0 ? "wingL" : "wingR";
      const wing = new Mesh(new BoxGeometry(4.4, 0.16, 1.9), stone(0x6f747b));
      wing.position.x = side * 2.3;
      wing.name = "wing";
      pivot.add(wing);
      g.add(pivot);
    }
    const tail = new Mesh(new BoxGeometry(1.2, 0.12, 1.5), stone(0x6f747b));
    tail.position.z = 2.5;
    g.add(tail);
    return g;
  });
  assets.registerPlaceholder("rider", () => {
    const g = new Group();
    const torso = new Mesh(new BoxGeometry(0.6, 0.9, 0.6), stone(0x4b5563));
    torso.position.set(0, 0.95, 0.2);
    const head = new Mesh(new SphereGeometry(0.34, 8, 6), stone(0xd8d2c0));
    head.position.set(0, 1.7, 0.2);
    g.add(torso, head);
    return g;
  });
  assets.registerPlaceholder("armor", () => {
    const g = new Group();
    const plate = new Mesh(new BoxGeometry(1.5, 0.3, 2.2), stone(0xd8d2c0));
    plate.position.set(0, 0.45, -0.3);
    plate.name = "plate";
    g.add(plate);
    return g;
  });
  assets.registerPlaceholder("shard", () => new Mesh(new OctahedronGeometry(1.1), stone(0xff6b5a, 0xc23a2c)));
};
