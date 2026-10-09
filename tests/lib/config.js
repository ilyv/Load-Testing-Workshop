export const BASE_URL = __ENV.BASE_URL || "http://quickpizza:3333";

// DURATION_SCALE=0.1 runs any test 10x faster (handy for a dry run).
const DURATION_SCALE = Number(__ENV.DURATION_SCALE || 1);

const UNIT_SECONDS = { s: 1, m: 60, h: 3600 };

export function duration(value) {
  const match = /^(\d+(?:\.\d+)?)(s|m|h)$/.exec(value);
  if (!match) {
    throw new Error(`Unsupported duration "${value}", use s, m or h`);
  }
  const seconds = Number(match[1]) * UNIT_SECONDS[match[2]] * DURATION_SCALE;
  return `${Math.max(1, Math.round(seconds))}s`;
}

export function stages(list) {
  return list.map((stage) => ({ ...stage, duration: duration(stage.duration) }));
}

export const defaultThresholds = {
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<500", "p(99)<1000"],
  checks: ["rate>0.99"],
};
