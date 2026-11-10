import { Application, Geometry, Mesh, Shader, UniformGroup } from "pixi.js";
import { useEffect, useRef } from "react";
import { DualKawaseBloom } from "./fogBloom";
import { BLOOM, FOG, glslColour, glslFloat, TRACES } from "./fogLook";
import { Sparks } from "./fogSparks";

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/*
 * Domain-warped fractal noise drifts as fog. Where a second, ridged noise is
 * near its zero crossing, thin glowing filaments appear; a slow travelling
 * mask lets them flare up here and there and fade again.
 */
const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 finalColor;
uniform float uTime;
uniform float uAspect;

const vec3 BASE = vec3(0.045, 0.05, 0.075);
const vec3 FOG = ${glslColour(FOG.colour)};
const vec3 MAGIC = ${glslColour(TRACES.colour)};
const float FOG_SPEED = ${glslFloat(FOG.speed)};
const float FOG_SCALE = ${glslFloat(FOG.scale)};
const float FOG_BRIGHTNESS = ${glslFloat(FOG.brightness)};
const float TRACE_BRIGHTNESS = ${glslFloat(TRACES.brightness)};
const float TRACE_WIDTH = ${glslFloat(TRACES.width)};

// Keep in step with fogField.ts, which follows this on the CPU.
float hash(ivec2 i) {
  uvec2 u = uvec2(i);
  uint h = u.x * 374761393u + u.y * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h) / 4294967295.0;
}
float noise(vec2 p) {
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + ivec2(1, 0)), f.x),
             mix(hash(i + ivec2(0, 1)), hash(i + ivec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.2 / FOG_SCALE;
  float t = uTime * FOG_SPEED;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.03)), fbm(p + vec2(5.2, 1.3) - t * 0.025));
  vec2 w = p + 1.6 * (q - 0.5) * 2.0;
  float fog = fbm(w + vec2(t * 0.02, -t * 0.015));
  fog = smoothstep(0.25, 0.85, fog);

  // Filaments follow the same flow, so they look carried along in the fog.
  float n = fbm(w * 1.7 + vec2(-t * 0.05, t * 0.04));
  float line = exp(-pow(abs(n - 0.5) * TRACE_WIDTH, 2.0));
  float gate = smoothstep(0.55, 0.9, fbm(p * 0.7 + vec2(t * 0.045, -t * 0.03) + 11.0));
  float flicker = 0.75 + 0.25 * sin(t * 1.7 + n * 20.0);
  float magic = line * gate * flicker * TRACE_BRIGHTNESS;

  vec3 col = BASE + FOG * fog * FOG_BRIGHTNESS;
  col += MAGIC * magic * (0.5 + 0.8 * fog);
  col += MAGIC * pow(gate, 2.0) * fog * 0.06;
  float vig = smoothstep(1.25, 0.25, length((vUv - 0.5) * vec2(1.0, 1.1)));
  finalColor = vec4(col * mix(0.55, 1.0, vig), 1.0);
}
`;

/**
 * The lobby's backdrop: swirling fog, threaded with faint magical
 * traces along which sparks run. A still frame
 * under reduced motion.
 */
export function FogBackdrop() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const app = new Application();
    let destroyed = false;

    void app
      .init({
        resizeTo: el,
        antialias: false,
        autoDensity: true,
        resolution: Math.min(devicePixelRatio, 1.5),
        preference: "webgl",
        autoStart: false,
      })
      .then(() => {
        if (destroyed) return app.destroy(true, { children: true });
        el.appendChild(app.canvas);

        const group = new UniformGroup({
          uTime: { value: 0, type: "f32" },
          uAspect: { value: 1, type: "f32" },
        });
        const uniforms = group.uniforms as { uTime: number; uAspect: number };
        app.stage.filters = [new DualKawaseBloom(BLOOM)];
        const shader = Shader.from({
          gl: { vertex, fragment },
          resources: { fog: group },
        });
        const quad = new Geometry({
          attributes: { aPosition: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]) },
          indexBuffer: [0, 1, 2, 0, 2, 3],
        });
        const mesh = new Mesh({ geometry: quad, shader });
        mesh.setSize(1, 1);
        app.stage.addChild(mesh);

        const sparks = new Sparks();
        app.stage.addChild(sparks.mesh);

        // Fog space spans 2.2 / scale across the screen's height, centred, with y up.
        const fit = () => {
          const { width, height } = app.screen;
          mesh.width = width;
          mesh.height = height;
          app.stage.filterArea = app.screen;
          uniforms.uAspect = width / height;
          group.update();
          const unit = (FOG.scale / 2.2) * height;
          sparks.view = { halfW: width / 2 / unit, halfH: height / 2 / unit, unit, width, height };
        };
        fit();
        app.renderer.on("resize", fit);

        if (reduced) {
          uniforms.uTime = 20;
          group.update();
          app.render();
          app.renderer.on("resize", () => app.render());
          return;
        }

        let time = 0;
        app.ticker.add((ticker) => {
          if (document.hidden) return;
          const dt = Math.min(ticker.deltaMS, 100) / 1000;
          time += dt;
          uniforms.uTime = time;
          group.update();
          sparks.update(dt, time * FOG.speed);
        });
        app.start();
      });

    return () => {
      destroyed = true;
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, []);

  return <div ref={host} className="fog-backdrop" aria-hidden="true" />;
}
