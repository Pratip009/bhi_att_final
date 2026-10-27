import Link from "next/link";
import { LOGO_URL, SCHOOL } from "@/lib/brand";

/** Logo and school name, used at the left of every header bar. */
export function BrandMark({ href, subtitle }: { href: string; subtitle: string }) {
  return (
    <Link href={href} className="brand" aria-label={`${SCHOOL.name}, ${subtitle}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URL} alt="" width={46} height={46} className="brand-logo" />
      <span className="brand-text">
        <span className="brand-name">Bright Horizon Institute</span>
        <span className="brand-sub">{subtitle}</span>
      </span>
    </Link>
  );
}

/** School letterhead at the top of the on-screen attendance sheet, matching the PDF and Word reports. */
export function Letterhead() {
  return (
    <div className="letterhead">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URL} alt="Bright Horizon Institute logo" width={74} height={74} />
      <div>
        <div className="letterhead-name">{SCHOOL.name}</div>
        <div><b>Address:</b> <a href={SCHOOL.addressHref} target="_blank" rel="noreferrer">{SCHOOL.address}</a></div>
        <div>
          <b>Phone:</b> <a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a>
          <span className="sep" /> <b>Email:</b> <a href={SCHOOL.emailHref}>{SCHOOL.email}</a>
          <span className="sep" /> <b>Web:</b> <a href={SCHOOL.websiteHref} target="_blank" rel="noreferrer">{SCHOOL.website}</a>
        </div>
      </div>
    </div>
  );
}

/** Contact details and privacy policy at the bottom of every page. */
export function SchoolFooter() {
  return (
    <footer className="site-foot no-print">
      <div className="site-foot-inner">
        <div>
          <strong>{SCHOOL.name}</strong>
          <div><a href={SCHOOL.addressHref} target="_blank" rel="noreferrer">{SCHOOL.address}</a></div>
        </div>
        <div className="site-foot-links">
          <a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a>
          <a href={SCHOOL.emailHref}>{SCHOOL.email}</a>
          <a href={SCHOOL.privacyHref} target="_blank" rel="noreferrer">Privacy Policy</a>
        </div>
      </div>
    </footer>
  );
}
