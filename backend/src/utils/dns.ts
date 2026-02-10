import dns from 'dns';
import { promisify } from 'util';

const resolveTxt = promisify(dns.resolveTxt);
const resolveMx = promisify(dns.resolveMx);

export interface DnsCheckResult {
  spfValid: boolean;
  dkimValid: boolean;
  dmarcValid: boolean;
  mxValid: boolean;
  details: {
    spf: string | null;
    dkim: string | null;
    dmarc: string | null;
    mx: string[];
  };
}

export async function checkDns(domain: string, dkimSelector: string = 'default'): Promise<DnsCheckResult> {
  const result: DnsCheckResult = {
    spfValid: false,
    dkimValid: false,
    dmarcValid: false,
    mxValid: false,
    details: { spf: null, dkim: null, dmarc: null, mx: [] },
  };

  try {
    // SPF check
    const txtRecords = await resolveTxt(domain);
    const spfRecord = txtRecords.flat().find((r) => r.startsWith('v=spf1'));
    if (spfRecord) {
      result.spfValid = true;
      result.details.spf = spfRecord;
    }
  } catch (e) {
    // No TXT records
  }

  try {
    // DKIM check
    const dkimRecords = await resolveTxt(`${dkimSelector}._domainkey.${domain}`);
    const dkimRecord = dkimRecords.flat().find((r) => r.includes('v=DKIM1'));
    if (dkimRecord) {
      result.dkimValid = true;
      result.details.dkim = dkimRecord;
    }
  } catch (e) {
    // No DKIM records - try google selector
    try {
      const dkimRecords = await resolveTxt(`google._domainkey.${domain}`);
      const dkimRecord = dkimRecords.flat().find((r) => r.includes('v=DKIM1'));
      if (dkimRecord) {
        result.dkimValid = true;
        result.details.dkim = dkimRecord;
      }
    } catch (e2) {
      // No DKIM
    }
  }

  try {
    // DMARC check
    const dmarcRecords = await resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = dmarcRecords.flat().find((r) => r.startsWith('v=DMARC1'));
    if (dmarcRecord) {
      result.dmarcValid = true;
      result.details.dmarc = dmarcRecord;
    }
  } catch (e) {
    // No DMARC
  }

  try {
    // MX check
    const mxRecords = await resolveMx(domain);
    if (mxRecords.length > 0) {
      result.mxValid = true;
      result.details.mx = mxRecords.map((r) => r.exchange);
    }
  } catch (e) {
    // No MX records
  }

  return result;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Extract domain from email
 */
export function getDomainFromEmail(email: string): string {
  return email.split('@')[1]?.toLowerCase() || '';
}
