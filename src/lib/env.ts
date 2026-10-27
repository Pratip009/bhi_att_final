import { z } from "zod";

const schema = z.object({
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, "MONGODB_URI must start with mongodb:// or mongodb+srv://"),
  MONGODB_DB: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  APP_TIMEZONE: z.string().default("America/New_York"),
  /** Typed times: how many minutes back a student may enter a time, and the shortest/longest day. */
  TIME_ENTRY_WINDOW_MINUTES: z.coerce.number().int().min(0).max(120).default(15),
  MIN_CLASS_MINUTES: z.coerce.number().int().min(1).max(240).default(5),
  MAX_CLASS_MINUTES: z.coerce.number().int().min(60).max(1440).default(720),
  NODE_ENV: z.string().default("development"),
});

let cached: z.infer<typeof schema> | null = null;

/** Validated settings. Fails with a clear message on first use if something is missing. */
export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  cached = parsed.data;
  return cached;
}
