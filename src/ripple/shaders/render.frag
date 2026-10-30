#version 300 es
// Shades the height field as liquid over the board: refraction, caustics,
// specular glints, a faint RF tint on wavefronts, and antenna LED glow.
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_state;
uniform sampler2D u_board;
uniform vec2 u_texel;
uniform float u_refract;
uniform float u_normal;
uniform float u_caustic;
uniform float u_spec;
uniform float u_tint;
uniform vec4 u_quiet;
uniform float u_quietOn;
uniform vec3 u_nodes[8];   // uv x, uv y, flash 0..1
uniform int u_nodeCount;
uniform float u_aspect;    // width / height
const vec3 ACCENT = vec3(0.0, 0.635, 1.0);
const vec3 COPPER = vec3(0.878, 0.627, 0.416);
float rectMask(vec2 p, vec4 r, float f) {
	vec2 a = smoothstep(r.xy - f, r.xy + f, p);
	vec2 b = 1.0 - smoothstep(r.zw - f, r.zw + f, p);
	return a.x * a.y * b.x * b.y;
}
void main() {
	float h = texture(u_state, v_uv).r;
	float hL = texture(u_state, v_uv - vec2(u_texel.x, 0.0)).r;
	float hR = texture(u_state, v_uv + vec2(u_texel.x, 0.0)).r;
	float hD = texture(u_state, v_uv - vec2(0.0, u_texel.y)).r;
	float hU = texture(u_state, v_uv + vec2(0.0, u_texel.y)).r;
	vec2 g = vec2(hR - hL, hU - hD);
	float lap = hL + hR + hD + hU - 4.0 * h;
	float q = 1.0;
	if (u_quietOn > 0.5) q = 1.0 - 0.85 * rectMask(v_uv, u_quiet, 0.015);

	vec3 n = normalize(vec3(-g * u_normal * q, 1.0));
	vec3 col = texture(u_board, v_uv + n.xy * u_refract).rgb;

	// caustics: convex patches focus light onto the board below
	float c = clamp(-lap * u_caustic, -0.6, 1.2) * q;
	col *= 1.0 + 0.85 * c;
	col += COPPER * max(c, 0.0) * 0.05;

	// specular glints; the flat-water baseline is subtracted so still water shows none
	vec3 H = normalize(normalize(vec3(-0.45, 0.6, 1.0)) + vec3(0.0, 0.0, 1.0));
	float s = max(pow(max(dot(n, H), 0.0), 90.0) - pow(H.z, 90.0), 0.0);
	col += vec3(0.85, 0.93, 1.0) * s * u_spec * q;

	col += ACCENT * smoothstep(0.01, 0.22, abs(h)) * u_tint * q;

	for (int i = 0; i < 8; i++) {
		if (i >= u_nodeCount) break;
		vec2 d = (v_uv - u_nodes[i].xy) * vec2(u_aspect, 1.0);
		float r2 = dot(d, d);
		col += ACCENT * u_nodes[i].z * (exp(-r2 * 2600.0) * 0.9 + exp(-r2 * 260.0) * 0.12);
	}
	outColor = vec4(col, 1.0);
}
