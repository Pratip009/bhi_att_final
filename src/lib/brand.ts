import { LOGO_PNG_BASE64 } from "./brand-logo";

/** School details printed on every PDF and Word report. Change them here, in one place. */
export const SCHOOL = {
  name: "BRIGHT HORIZON INSTITUTE",
  phone: "201-377-1594",
  phoneHref: "tel:2013771594",
  email: "contactus@bhilearning.com",
  emailHref: "mailto:contactus@bhilearning.com",
  address: "910 Bergen Ave Floor 3, Jersey City, New Jersey NJ 07306",
  addressHref: "https://www.google.com/maps?q=910+Bergen+Ave,+Floor+3,+Jersey+City,+NJ+07306",
  website: "www.brighthorizoninstitute.com",
  websiteHref: "https://www.brighthorizoninstitute.com",
  privacyHref: "https://www.brighthorizoninstitute.com/privacy-policy",
  /** The logo's navy, as hex (Word) and 0–1 RGB (PDF). */
  colorHex: "2F3170",
  colorRgb: [47 / 255, 49 / 255, 112 / 255] as const,
} as const;

export const LOGO_PNG = Buffer.from(LOGO_PNG_BASE64, "base64");