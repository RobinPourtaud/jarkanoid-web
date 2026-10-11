import { asset, json } from "./assets";

export type SceneName = "intro" | "outro" | "youwon";
export type Scene = {
  name: SceneName;
  initial: number[][];
  segments: { frames: number; velocity: number[][] }[];
  frames: number;
  meshes: { file: string; vertices: number; texture: string | null }[];
};

export function poseAt(scene: Scene, frame: number): number[][] {
  const pose = scene.initial.map((v) => [...v]);
  let remaining = Math.max(0, Math.min(frame, scene.frames));
  for (const segment of scene.segments) {
    const count = Math.min(remaining, segment.frames);
    for (let object = 0; object < pose.length; object++)
      for (let axis = 0; axis < 9; axis++)
        pose[object][axis] += segment.velocity[object][axis] * count;
    remaining -= count;
    if (remaining <= 0) break;
  }
  return pose;
}

const vertexSource = `
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform vec3 translation;
uniform vec3 scaling;
uniform vec3 rotation;
varying vec2 texcoord;
varying float light;
vec3 rotate(vec3 p) {
  vec3 c = cos(rotation), s = sin(rotation);
  p = vec3(p.x, c.x*p.y-s.x*p.z, s.x*p.y+c.x*p.z);
  p = vec3(c.y*p.x+s.y*p.z, p.y, -s.y*p.x+c.y*p.z);
  return vec3(c.z*p.x-s.z*p.y, s.z*p.x+c.z*p.y, p.z);
}
void main() {
  vec3 p = rotate(position*scaling)+translation;
  p.z += 20.0;
  gl_Position = vec4(p.x, p.y, (301.0*p.z-600.0)/299.0, p.z);
  texcoord = uv;
  light = 0.65 + 0.35*abs(dot(normalize(rotate(normal)),normalize(vec3(-0.3,0.5,-1.0))));
}`;
const fragmentSource = `
precision mediump float;
uniform sampler2D texture0;
varying vec2 texcoord;
varying float light;
void main() {
  vec4 color = texture2D(texture0,texcoord);
  gl_FragColor = vec4(color.rgb*light,color.a);
}`;

type Mesh = { buffer: WebGLBuffer; texture: WebGLTexture; vertices: number };
export class Cinema {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private meshes: Mesh[] = [];
  private request = 0;
  scene?: Scene;
  frame = 0;
  playing = true;
  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
    if (!gl) throw new Error("3D playback needs WebGL in this browser.");
    this.gl = gl;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(`Could not compile cinema shader: ${error}`);
      }
      return s;
    };
    const vertex = shader(gl.VERTEX_SHADER, vertexSource);
    const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error("Could not initialize 3D playback.");
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
  }
  async load(pack: number, name: SceneName) {
    const request = ++this.request;
    const scene = await json<Scene>(asset(pack, `scene-${name}.json`));
    const data = await Promise.all(
      scene.meshes.map(async (mesh) => {
        const response = await fetch(asset(pack, mesh.file));
        if (!response.ok)
          throw new Error(`Missing cinematic mesh ${mesh.file}`);
        const vertices = new Float32Array(await response.arrayBuffer());
        if (vertices.length !== mesh.vertices * 8)
          throw new Error("Invalid mesh size");
        let image: HTMLImageElement | undefined;
        if (mesh.texture) {
          image = new Image();
          image.src = asset(pack, mesh.texture);
          await image.decode();
        }
        return { vertices, image };
      }),
    );
    if (request !== this.request) return;
    this.releaseMeshes();
    const gl = this.gl;
    this.meshes = data.map(({ vertices, image }) => {
      const buffer = gl.createBuffer()!,
        texture = gl.createTexture()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (image)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image,
        );
      else
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          1,
          1,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array([220, 240, 255, 255]),
        );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return { buffer, texture, vertices: vertices.length / 8 };
    });
    this.scene = scene;
    this.frame = 0;
    this.playing = true;
    this.render();
  }
  update(dt: number) {
    if (!this.scene) return;
    if (this.playing && !document.hidden) {
      this.frame = Math.min(
        this.scene.frames,
        this.frame + Math.min(dt, 0.1) * 60,
      );
      if (this.frame >= this.scene.frames) this.playing = false;
    }
    this.render();
  }
  render() {
    if (!this.scene) return;
    const gl = this.gl,
      pose = poseAt(this.scene, this.frame);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i],
        state = pose[i];
      if (state.slice(3, 6).some((s) => Math.abs(s) < 0.00001)) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
      for (const [name, size, offset] of [
        ["position", 3, 0],
        ["normal", 3, 12],
        ["uv", 2, 24],
      ] as const) {
        const location = gl.getAttribLocation(this.program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 32, offset);
      }
      gl.uniform3fv(
        gl.getUniformLocation(this.program, "translation"),
        state.slice(0, 3),
      );
      gl.uniform3fv(
        gl.getUniformLocation(this.program, "scaling"),
        state.slice(3, 6),
      );
      gl.uniform3fv(
        gl.getUniformLocation(this.program, "rotation"),
        state.slice(6, 9).map((a) => (a * Math.PI) / 180),
      );
      gl.bindTexture(gl.TEXTURE_2D, mesh.texture);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices);
    }
  }
  private releaseMeshes() {
    for (const mesh of this.meshes) {
      this.gl.deleteBuffer(mesh.buffer);
      this.gl.deleteTexture(mesh.texture);
    }
    this.meshes = [];
  }
  dispose() {
    this.request++;
    this.releaseMeshes();
    this.gl.deleteProgram(this.program);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
