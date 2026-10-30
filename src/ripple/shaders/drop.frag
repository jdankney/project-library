#version 300 es
// Adds a smooth cosine bump to the height field: one ping.
precision highp float;
in vec2 v_uv;
out vec4 outState;
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform vec2 u_center;   // uv
uniform float u_radius;  // sim texels
uniform float u_strength;
void main() {
	vec4 s = texture(u_state, v_uv);
	float r = length((v_uv - u_center) / u_texel) / u_radius;
	float d = max(0.0, 1.0 - r);
	s.r += (0.5 - 0.5 * cos(d * 3.14159265)) * u_strength;
	outState = s;
}
