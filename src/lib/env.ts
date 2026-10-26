import { z } from "zod";

const schema = z.object({
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, "MONGODB_URI must start with mongodb:// or mongodb+srv://"),
  MONGODB_DB: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  APP_TIMEZONE: z.string().default("America/New_York"),
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
