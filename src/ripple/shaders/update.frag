#version 300 es
// One step of the wave equation. r = height, g = velocity.
// v += (avg4 - h) * 2 gives c^2 = 0.5, a wavefront speed of ~0.707 texels per step.
precision highp float;
in vec2 v_uv;
out vec4 outState;
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform float u_damping;
uniform vec4 u_quiet;        // uv rect x0, y0, x1, y1
uniform float u_quietOn;
uniform float u_quietDamping;
float inRect(vec2 p, vec4 r) {
	return step(r.x, p.x) * step(p.x, r.z) * step(r.y, p.y) * step(p.y, r.w);
}
void main() {
	vec4 s = texture(u_state, v_uv);
	float avg = 0.25 * (
		texture(u_state, v_uv - vec2(u_texel.x, 0.0)).r +
		texture(u_state, v_uv + vec2(u_texel.x, 0.0)).r +
		texture(u_state, v_uv - vec2(0.0, u_texel.y)).r +
		texture(u_state, v_uv + vec2(0.0, u_texel.y)).r);
	s.g += (avg - s.r) * 2.0;
	float damping = u_damping;
	if (u_quietOn > 0.5) damping = mix(damping, u_quietDamping, inRect(v_uv, u_quiet));
	// soak up energy near the edges so waves don't bounce off the canvas border
	float edge = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
	damping *= mix(0.93, 1.0, smoothstep(0.0, 0.035, edge));
	s.g *= damping;
	s.r += s.g;
	s.r *= 0.9995;
	outState = s;
}
